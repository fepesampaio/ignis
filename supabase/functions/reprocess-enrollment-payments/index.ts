import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Calculate split percentage based on course category
function getSplitPercentage(category: string | null): number {
  if (!category) return 0;
  
  const normalizedCategory = category.toLowerCase().trim();
  
  // EJA and Technical courses: 40%
  if (normalizedCategory === 'eja' || normalizedCategory === 'técnico') {
    return 40;
  }
  
  // Technical by Competency: 35%
  if (normalizedCategory === 'técnico por competência' || normalizedCategory === 'por competência' || normalizedCategory === 'competência') {
    return 35;
  }
  
  // Professional courses: 50%
  if (normalizedCategory === 'profissional') {
    return 50;
  }
  
  return 0;
}

// Check if student has EJA + Técnico combination for 8% discount
// deno-lint-ignore no-explicit-any
async function checkEjaTecnicoDiscount(
  supabase: any,
  userId: string,
  currentCourseCategory: string | null
): Promise<{ hasDiscount: boolean; discountPercentage: number }> {
  if (!currentCourseCategory) return { hasDiscount: false, discountPercentage: 0 };
  
  const normalizedCurrentCategory = currentCourseCategory.toLowerCase().trim();
  const isCurrentEja = normalizedCurrentCategory === 'eja' || normalizedCurrentCategory.includes('eja');
  const isCurrentTecnico = normalizedCurrentCategory === 'técnico' || normalizedCurrentCategory.includes('técnico');
  
  if (!isCurrentEja && !isCurrentTecnico) {
    return { hasDiscount: false, discountPercentage: 0 };
  }
  
  // Get all active enrollments for this user with course data
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, course_id")
    .eq("user_id", userId)
    .eq("is_active", true);
    
  if (!enrollments || enrollments.length < 2) {
    return { hasDiscount: false, discountPercentage: 0 };
  }
  
  // Get course categories for all enrollments
  const courseIds = enrollments.map((e: { course_id: string }) => e.course_id);
  const { data: courses } = await supabase
    .from("courses")
    .select("id, category")
    .in("id", courseIds);
    
  if (!courses) {
    return { hasDiscount: false, discountPercentage: 0 };
  }
  
  // Check if student has both EJA and Técnico enrollments
  let hasEja = false;
  let hasTecnico = false;
  
  for (const course of courses) {
    const category = (course.category || '').toLowerCase().trim();
    
    if (category === 'eja' || category.includes('eja')) {
      hasEja = true;
    }
    if (category === 'técnico' || category.includes('técnico')) {
      hasTecnico = true;
    }
  }
  
  if (hasEja && hasTecnico) {
    console.log("EJA + Técnico combination detected - applying 8% discount");
    return { hasDiscount: true, discountPercentage: 8 };
  }
  
  return { hasDiscount: false, discountPercentage: 0 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asaasApiKey = Deno.env.get("ASAAS_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { enrollmentId, deleteExisting = true, firstDueDate, customValue, customInstallments } = await req.json();

    if (!enrollmentId) {
      return new Response(
        JSON.stringify({ success: false, error: "enrollmentId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!firstDueDate) {
      return new Response(
        JSON.stringify({ success: false, error: "firstDueDate is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Reprocessing enrollment:", enrollmentId);

    // Get Asaas environment from system settings
    const { data: asaasEnvSetting } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "asaas_environment")
      .single();
    
    let asaasEnv = "sandbox";
    if (asaasEnvSetting?.value) {
      const envValue = typeof asaasEnvSetting.value === 'string' 
        ? asaasEnvSetting.value.replace(/"/g, '') 
        : String(asaasEnvSetting.value).replace(/"/g, '');
      asaasEnv = envValue.toLowerCase().trim();
    }
    
    const asaasBaseUrl = asaasEnv === "production" 
      ? "https://api.asaas.com/v3"
      : "https://sandbox.asaas.com/api/v3";
    
    console.log("Asaas environment:", asaasEnv, "Base URL:", asaasBaseUrl);

    // Get enrollment with related data
    const { data: enrollment, error: enrollmentError } = await supabase
      .from("enrollments")
      .select(`
        *,
        polos:polo_id(id, name, wallet_id)
      `)
      .eq("id", enrollmentId)
      .single();

    if (enrollmentError || !enrollment) {
      console.error("Enrollment not found:", enrollmentError);
      return new Response(
        JSON.stringify({ success: false, error: "Enrollment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get course info with installment configuration
    const { data: course } = await supabase
      .from("courses")
      .select("id, title, category, installment_price, installment_count")
      .eq("id", enrollment.course_id)
      .single();

    if (!course) {
      return new Response(
        JSON.stringify({ success: false, error: "Course not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate course has installment configuration (only if not using custom values)
    if (!customValue && !customInstallments && (!course.installment_price || !course.installment_count)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `O curso "${course.title}" não tem valor de parcela ou número de parcelas configurado. Configure esses valores na edição do curso ou use valores personalizados.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", enrollment.user_id)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing payments
    const { data: existingPayments } = await supabase
      .from("payments")
      .select("*")
      .eq("user_id", enrollment.user_id)
      .eq("course_id", enrollment.course_id);

    console.log("Existing payments:", existingPayments?.length || 0);

    // Check for EJA + Técnico discount
    const discountInfo = await checkEjaTecnicoDiscount(supabase, enrollment.user_id, course.category);
    
    // Use custom values if provided, otherwise use course configuration
    let monthlyValue: number;
    let installments: number;
    
    if (customValue && customInstallments) {
      // Use custom values provided by admin
      monthlyValue = Number(customValue);
      installments = Number(customInstallments);
      console.log(`Using custom values: ${installments}x R$${monthlyValue.toFixed(2)}`);
    } else {
      // Use course installment configuration with potential discount
      monthlyValue = Number(course.installment_price);
      installments = course.installment_count;
      
      if (discountInfo.hasDiscount) {
        const discountAmount = monthlyValue * (discountInfo.discountPercentage / 100);
        monthlyValue = monthlyValue - discountAmount;
        console.log(`Applying ${discountInfo.discountPercentage}% discount: R$${course.installment_price} -> R$${monthlyValue.toFixed(2)}`);
      }
      
      console.log(`Course installment config: ${installments}x R$${monthlyValue.toFixed(2)}`);
    }
    
    // Parse the first due date
    const firstDueDateParsed = new Date(firstDueDate);
    const dueDateDay = firstDueDateParsed.getDate();

    // Get polo info and calculate split
    const polo = enrollment.polos as { id: string; name: string; wallet_id: string } | null;
    const splitPercentage = getSplitPercentage(course?.category);

    console.log("Polo info:", polo);
    console.log("Course category:", course?.category);
    console.log("Split percentage:", splitPercentage);

    if (!polo) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Esta matrícula não tem polo vinculado. Split não aplicável." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (splitPercentage === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Categoria do curso "${course?.category || 'não definida'}" não tem percentual de split configurado.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete existing payments from Asaas and database if requested
    if (deleteExisting && existingPayments && existingPayments.length > 0) {
      console.log("Deleting existing payments from Asaas...");
      
      for (const payment of existingPayments) {
        if (payment.asaas_payment_id) {
          try {
            const deleteResponse = await fetch(
              `${asaasBaseUrl}/payments/${payment.asaas_payment_id}`,
              {
                method: "DELETE",
                headers: {
                  "accept": "application/json",
                  "access_token": asaasApiKey,
                },
              }
            );
            
            if (deleteResponse.ok) {
              console.log(`Deleted Asaas payment: ${payment.asaas_payment_id}`);
            } else {
              console.warn(`Failed to delete Asaas payment: ${payment.asaas_payment_id}`);
            }
          } catch (err) {
            console.error(`Error deleting Asaas payment: ${payment.asaas_payment_id}`, err);
          }
        }
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("user_id", enrollment.user_id)
        .eq("course_id", enrollment.course_id);

      if (deleteError) {
        console.error("Error deleting payments from database:", deleteError);
      } else {
        console.log("Deleted all payments from database");
      }
    }

    // Find or create customer in Asaas
    let customerId = null;
    const studentCpf = profile.cpf?.replace(/\D/g, '') || '';

    try {
      console.log("Looking for existing customer with email:", profile.email);
      
      const searchResponse = await fetch(
        `${asaasBaseUrl}/customers?email=${encodeURIComponent(profile.email)}`,
        {
          method: "GET",
          headers: {
            "accept": "application/json",
            "access_token": asaasApiKey,
          },
        }
      );
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.data && searchData.data.length > 0) {
          customerId = searchData.data[0].id;
          console.log("Found existing customer:", customerId);
        }
      }
      
      if (!customerId) {
        console.log("Creating new customer:", profile.full_name);
        
        const customerPayload: Record<string, string> = {
          name: profile.full_name,
          email: profile.email,
        };
        
        if (studentCpf) {
          customerPayload.cpfCnpj = studentCpf;
        }
        
        const createCustomerResponse = await fetch(
          `${asaasBaseUrl}/customers`,
          {
            method: "POST",
            headers: {
              "accept": "application/json",
              "content-type": "application/json",
              "access_token": asaasApiKey,
            },
            body: JSON.stringify(customerPayload),
          }
        );
        
        if (createCustomerResponse.ok) {
          const customerData = await createCustomerResponse.json();
          customerId = customerData.id;
          console.log("Created new customer:", customerId);
        } else {
          const errorText = await createCustomerResponse.text();
          console.error("Create customer error:", errorText);
          throw new Error(`Failed to create customer: ${createCustomerResponse.status}`);
        }
      }
    } catch (customerError) {
      console.error("Error managing customer:", customerError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create/find customer in Asaas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new payments with split
    const paymentsToCreate = [];
    
    let createdCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < installments; i++) {
      // For the first payment, use the exact firstDueDate
      // For subsequent payments, add months to the first due date
      const dueDate = new Date(firstDueDateParsed);
      dueDate.setMonth(dueDate.getMonth() + i);
      const dueDateStr = dueDate.toISOString().split('T')[0];
      
      try {
        const paymentBody: Record<string, unknown> = {
          customer: customerId,
          billingType: "BOLETO",
          value: monthlyValue,
          dueDate: dueDateStr,
          description: `${course?.title || 'Curso'} - Parcela ${i + 1}/${installments}`,
          externalReference: `${enrollment.id}_${i + 1}`,
          split: [
            {
              walletId: polo.wallet_id,
              percentualValue: splitPercentage,
            }
          ]
        };

        console.log(`Creating payment ${i + 1}/${installments} with split: ${splitPercentage}%`);
        
        const asaasResponse = await fetch(
          `${asaasBaseUrl}/payments`,
          {
            method: "POST",
            headers: {
              "accept": "application/json",
              "content-type": "application/json",
              "access_token": asaasApiKey,
            },
            body: JSON.stringify(paymentBody),
          }
        );
        
        if (!asaasResponse.ok) {
          const errorText = await asaasResponse.text();
          console.error(`Payment ${i + 1} error:`, errorText);
          failedCount++;
          continue;
        }
        
        const asaasPayment = await asaasResponse.json();
        console.log(`Created payment ${i + 1}/${installments}:`, asaasPayment.id);
        createdCount++;
        
        paymentsToCreate.push({
          user_id: enrollment.user_id,
          course_id: enrollment.course_id,
          amount: monthlyValue,
          due_date: dueDateStr,
          status: "PENDING",
          asaas_payment_id: asaasPayment.id,
          installment_number: i + 1,
          total_installments: installments,
        });
      } catch (paymentError) {
        console.error(`Error creating payment ${i + 1}:`, paymentError);
        failedCount++;
      }
    }

    // Save payments to database
    if (paymentsToCreate.length > 0) {
      const { error: insertError } = await supabase
        .from("payments")
        .insert(paymentsToCreate);
        
      if (insertError) {
        console.error("Error inserting payments:", insertError);
      } else {
        console.log(`Saved ${paymentsToCreate.length} payments to database`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reprocessamento concluído`,
        details: {
          created: createdCount,
          failed: failedCount,
          splitPercentage,
          splitValue: (monthlyValue * splitPercentage) / 100,
          polo: polo.name,
          category: course?.category,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in reprocess-enrollment-payments:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
