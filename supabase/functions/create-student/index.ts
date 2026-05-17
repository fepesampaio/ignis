import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdditionalData {
  sex?: string;
  cpf?: string;
  birthDate?: string;
  address?: {
    cep?: string;
    streetNumber?: string;
    street?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  whatsapp?: string;
  dueDate?: string;
  monthlyValue?: number;
  installments?: number;
}

interface SplitConfig {
  walletId: string;
  percentage: number;
  poloName: string;
}

interface CreateStudentRequest {
  email: string;
  fullName: string;
  phone?: string;
  courseId?: string;
  courseIds?: string[]; // Support for multiple courses
  courseName?: string;
  sendEmail?: boolean;
  platformUrl?: string;
  poloId?: string;
  splitConfig?: SplitConfig;
  hasDiscount?: boolean;
  discountPercentage?: number;
  isMigrated?: boolean; // For students migrated from Moodle
  migrationSource?: string; // e.g., 'moodle'
  additionalData?: AdditionalData;
}

// Get contract PDF URL from storage based on category
async function getContractPdfUrl(
  supabase: any,
  category: string
): Promise<{ url: string; name: string } | null> {
  const categoryLower = (category || "").toLowerCase();
  const isCompetencia = categoryLower.includes("competência") || categoryLower.includes("competencia");
  const fileName = isCompetencia ? "contrato-competencia.pdf" : "contrato-aluno.pdf";
  const templateName = isCompetencia ? "Contrato Competência" : "Contrato Aluno";

  console.log(`Looking for contract PDF: ${fileName}`);

  // Get public URL from storage
  const { data } = supabase.storage
    .from("contract-templates")
    .getPublicUrl(fileName);

  if (!data?.publicUrl) {
    console.error(`Contract PDF "${fileName}" not found in storage`);
    return null;
  }

  console.log(`Using contract PDF: ${data.publicUrl}`);
  return { url: data.publicUrl, name: templateName };
}

// Helper function to convert blob to base64
async function blobToBase64(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

// Wait for document to be ready for assignment (poll status)
async function waitForDocumentReady(
  apiKey: string,
  documentId: string,
  maxAttempts: number = 10,
  delayMs: number = 2000
): Promise<{ ready: boolean; status: string }> {
  console.log(`Waiting for document ${documentId} to be ready...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const statusEndpoint = `https://api.assinafy.com.br/v1/documents/${documentId}`;
    
    const response = await fetch(statusEndpoint, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
      },
    });
    
    if (!response.ok) {
      console.log(`Attempt ${attempt}: Failed to get document status (${response.status})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }
    
    const data = await response.json();
    const documentData = data.data || data;
    const status = documentData.status;
    
    console.log(`Attempt ${attempt}: Document status is "${status}"`);
    
    // Document is ready when status is not in processing states
    const processingStatuses = ['uploaded', 'metadata_processing', 'processing', 'pending_upload'];
    
    if (!processingStatuses.includes(status)) {
      console.log(`Document is ready with status: ${status}`);
      return { ready: true, status };
    }
    
    if (attempt < maxAttempts) {
      console.log(`Document still processing, waiting ${delayMs}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.log(`Document did not become ready after ${maxAttempts} attempts`);
  return { ready: false, status: 'timeout' };
}

// Upload PDF to Assinafy and create document with signer
// Following the correct API flow: upload → wait for ready → create signer → create assignment
async function createDocumentWithSigner(
  apiKey: string,
  accountId: string,
  pdfUrl: string,
  title: string,
  signer: { name: string; email: string; role: string }
): Promise<{ documentId: string | null; signingUrl: string | null }> {
  console.log(`=== ASSINAFY INTEGRATION START ===`);
  console.log(`Creating document from PDF: ${pdfUrl}`);
  console.log(`Signer: ${signer.name} <${signer.email}>`);
  console.log(`Account ID: ${accountId}`);
  
  // STEP 1: Fetch the PDF from storage
  const pdfResponse = await fetch(pdfUrl);
  if (!pdfResponse.ok) {
    console.error("Error fetching PDF from storage:", pdfResponse.status);
    return { documentId: null, signingUrl: null };
  }
  
  const pdfBlob = await pdfResponse.blob();
  console.log(`PDF fetched, size: ${pdfBlob.size} bytes`);
  
  // STEP 2: Upload document (just the file, no signers yet)
  const formData = new FormData();
  formData.append("title", title);
  formData.append("file", pdfBlob, `${title}.pdf`);
  
  const uploadEndpoint = `https://api.assinafy.com.br/v1/accounts/${accountId}/documents`;
  console.log(`STEP 2: Uploading document to: ${uploadEndpoint}`);
  
  const uploadResponse = await fetch(uploadEndpoint, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
    },
    body: formData,
  });
  
  const uploadResponseText = await uploadResponse.text();
  console.log(`Upload response status: ${uploadResponse.status}`);
  console.log(`Upload response body: ${uploadResponseText.substring(0, 1000)}`);
  
  if (!uploadResponse.ok) {
    console.error("Failed to upload document:", uploadResponseText);
    return { documentId: null, signingUrl: null };
  }
  
  const uploadData = JSON.parse(uploadResponseText);
  const documentData = uploadData.data || uploadData;
  const documentId = documentData.id || documentData.documentId;
  
  console.log(`Document uploaded with ID: ${documentId}`);
  console.log(`Document status after upload: ${documentData.status}`);
  
  // STEP 2.5: Wait for document to finish processing
  console.log(`STEP 2.5: Waiting for document to finish processing...`);
  const { ready, status: finalStatus } = await waitForDocumentReady(apiKey, documentId, 15, 2000);
  
  if (!ready) {
    console.error(`Document is stuck in processing status: ${finalStatus}`);
    console.log("Will attempt assignment anyway...");
  }
  
  // STEP 3: Create signer in the account
  console.log(`STEP 3: Creating signer: ${signer.name} <${signer.email}>`);
  
  const signerEndpoint = `https://api.assinafy.com.br/v1/accounts/${accountId}/signers`;
  const signerResponse = await fetch(signerEndpoint, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      full_name: signer.name,
      email: signer.email,
    }),
  });
  
  const signerResponseText = await signerResponse.text();
  console.log(`Signer response status: ${signerResponse.status}`);
  console.log(`Signer response body: ${signerResponseText.substring(0, 500)}`);
  
  let signerId: string | null = null;
  
  if (signerResponse.ok) {
    const signerData = JSON.parse(signerResponseText);
    const signerInfo = signerData.data || signerData;
    signerId = signerInfo.id;
    console.log(`Signer created with ID: ${signerId}`);
  } else {
    // If signer already exists, try to find by email
    console.log("Signer creation failed, trying to find existing signer by email...");
    
    const listSignersEndpoint = `https://api.assinafy.com.br/v1/accounts/${accountId}/signers?search=${encodeURIComponent(signer.email)}`;
    const listResponse = await fetch(listSignersEndpoint, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
      },
    });
    
    if (listResponse.ok) {
      const listData = await listResponse.json();
      const signers = listData.data || listData;
      if (Array.isArray(signers) && signers.length > 0) {
        signerId = signers[0].id;
        console.log(`Found existing signer with ID: ${signerId}`);
      }
    }
  }
  
  if (!signerId) {
    console.error("Could not create or find signer. Aborting assignment.");
    return { documentId, signingUrl: null };
  }
  
  // STEP 4: Create assignment (this sends the signature request)
  console.log(`STEP 4: Creating assignment to send signature request...`);
  
  const assignmentEndpoint = `https://api.assinafy.com.br/v1/documents/${documentId}/assignments`;
  console.log(`Assignment endpoint: ${assignmentEndpoint}`);
  
  const assignmentBody = {
    method: "virtual", // No input fields required
    signers: [
      {
        id: signerId,
        verification_method: "Email", // Signer verifies via email code
        notification_methods: ["Email"], // Send invitation via email
      }
    ],
    message: "Por favor, assine o contrato de matrícula.",
  };
  
  console.log(`Assignment body: ${JSON.stringify(assignmentBody)}`);
  
  const assignmentResponse = await fetch(assignmentEndpoint, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(assignmentBody),
  });
  
  const assignmentResponseText = await assignmentResponse.text();
  console.log(`Assignment response status: ${assignmentResponse.status}`);
  console.log(`Assignment response body: ${assignmentResponseText.substring(0, 1000)}`);
  
  let signingUrl: string | null = null;
  
  if (assignmentResponse.ok) {
    const assignmentData = JSON.parse(assignmentResponseText);
    const assignment = assignmentData.data || assignmentData;
    
    // Extract signing URL from response
    if (assignment.signing_urls && assignment.signing_urls.length > 0) {
      signingUrl = assignment.signing_urls[0].url;
    }
    
    console.log(`=== SUCCESS! Assignment created ===`);
    console.log(`Signature request sent to: ${signer.email}`);
    console.log(`Signing URL: ${signingUrl}`);
  } else {
    console.error(`=== FAILED! Assignment creation failed ===`);
    console.error(`Status: ${assignmentResponse.status}`);
    console.error(`Response: ${assignmentResponseText}`);
  }
  
  console.log(`=== ASSINAFY INTEGRATION END ===`);
  
  return { documentId, signingUrl };
}

// Send document for signature
async function sendDocumentForSignature(
  apiKey: string,
  accountId: string,
  documentId: string,
  message?: string
): Promise<boolean> {
  console.log(`Sending document ${documentId} for signature...`);
  
  const body = message ? { message } : {};
  const endpoint = `https://api.assinafy.com.br/v1/accounts/${accountId}/documents/${documentId}/send`;
  console.log(`Send endpoint: ${endpoint}`);
  
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  
  const responseText = await response.text();
  console.log(`Send response status: ${response.status}`);
  console.log(`Send response body: ${responseText.substring(0, 300)}`);
  
  if (!response.ok) {
    console.error("Error sending document:", response.status, responseText);
    return false;
  }
  
  console.log("Document sent for signature successfully");
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asssinafyApiKey = Deno.env.get("ASSINAFY_API_KEY");
    const asssinafyAccountId = Deno.env.get("ASSINAFY_ACCOUNT_ID") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !requestingUser) {
      throw new Error("Invalid token");
    }

    // Check if requesting user is admin or polo
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .single();

    const userRole = roleData?.role;
    if (roleError || (userRole !== "admin" && userRole !== "polo")) {
      throw new Error("Unauthorized: Only admins or polo users can create students");
    }

    const { 
      email, 
      fullName, 
      phone, 
      courseId, 
      courseIds,
      courseName,
      sendEmail, 
      platformUrl,
      poloId,
      splitConfig,
      hasDiscount,
      discountPercentage,
      isMigrated,
      migrationSource,
      additionalData 
    }: CreateStudentRequest = await req.json();

    console.log("Creating student with courses:", courseIds || [courseId]);
    if (hasDiscount) {
      console.log(`EJA + Técnico discount detected: ${discountPercentage}%`);
    }
    if (isMigrated) {
      console.log(`Migrated student from: ${migrationSource || 'unknown'}`);
    }

    if (!email || !fullName) {
      throw new Error("Email and full name are required");
    }

    // ===== Age vs course category validation =====
    // Students under 18 cannot enroll in EJA or Técnico courses
    const allRequestedCourseIds = (courseIds && courseIds.length > 0)
      ? courseIds
      : (courseId ? [courseId] : []);

    if (additionalData?.birthDate && allRequestedCourseIds.length > 0) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(additionalData.birthDate);
      if (m) {
        const [, dd, mm, yyyy] = m;
        const birth = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
        if (!isNaN(birth.getTime())) {
          const today = new Date();
          let age = today.getFullYear() - birth.getFullYear();
          const monthDiff = today.getMonth() - birth.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;

          if (age < 18) {
            const { data: catCourses } = await supabase
              .from("courses")
              .select("category")
              .in("id", allRequestedCourseIds);

            const restricted = (catCourses || []).some((c: { category: string | null }) => {
              const cat = (c.category || "").toLowerCase();
              return cat.includes("eja") || cat.includes("técnico") || cat.includes("tecnico");
            });

            if (restricted) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: "Para cursos das categorias EJA e Técnico, o aluno deve ter pelo menos 18 anos completos",
                }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
        }
      }
    }

    // Log split config
    if (splitConfig) {
      console.log("Split config received:", JSON.stringify(splitConfig));
    }

    // Use CPF as password (without formatting) - standard access credentials
    // If CPF is not provided, generate a random password
    let password: string;
    if (additionalData?.cpf) {
      password = additionalData.cpf.replace(/\D/g, ''); // Remove formatting from CPF
      console.log("Using CPF as password");
    } else {
      password = generatePassword();
      console.log("CPF not provided, using generated password");
    }

    // Check if user already exists by email
    let newUserId: string;
    let isExistingUser = false;
    
    // First, check in profiles table
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    
    if (existingProfile) {
      // User already exists, reuse their ID
      newUserId = existingProfile.user_id;
      isExistingUser = true;
      console.log("User already exists, reusing existing user:", newUserId);
    } else {
      // Try to create new user using admin API
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
        },
      });

      if (authError) {
        // If user already exists in auth but not in profiles, get their ID
        if (authError.message.includes("already been registered")) {
          const { data: userData } = await supabase.auth.admin.listUsers();
          const existingAuthUser = userData?.users?.find(u => u.email === email);
          
          if (existingAuthUser) {
            newUserId = existingAuthUser.id;
            isExistingUser = true;
            console.log("Found existing auth user:", newUserId);
          } else {
            throw new Error("Este e-mail já está cadastrado no sistema");
          }
        } else {
          throw authError;
        }
      } else if (!authData?.user) {
        throw new Error("Failed to create user");
      } else {
        newUserId = authData.user.id;
      }
    }

    // Build profile data
    const profileData: Record<string, unknown> = {
      user_id: newUserId,
      email,
      full_name: fullName,
      phone: phone || additionalData?.whatsapp || null,
    };

    if (additionalData) {
      if (additionalData.cpf) profileData.cpf = additionalData.cpf;
      if (additionalData.sex) profileData.sex = additionalData.sex;
      if (additionalData.birthDate) profileData.birth_date = additionalData.birthDate;
      if (additionalData.whatsapp) profileData.whatsapp = additionalData.whatsapp;
      if (additionalData.address) {
        profileData.address_cep = additionalData.address.cep;
        profileData.address_street = additionalData.address.street;
        profileData.address_number = additionalData.address.streetNumber;
        profileData.address_neighborhood = additionalData.address.neighborhood;
        profileData.address_city = additionalData.address.city;
        profileData.address_state = additionalData.address.state;
      }
    }

    // Always update profile using UPDATE - the trigger handle_new_user creates the initial profile
    // We use UPDATE instead of upsert because upsert requires a unique constraint on user_id
    console.log("Updating profile with data:", JSON.stringify(profileData));
    
    // Remove user_id from update data (it's used in the WHERE clause)
    const { user_id: _, ...updateData } = profileData;
    
    const { error: profileError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("user_id", newUserId);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      
      // If update fails (profile doesn't exist yet), try insert
      console.log("Attempting insert as fallback...");
      const { error: insertError } = await supabase
        .from("profiles")
        .insert(profileData);
      
      if (insertError) {
        console.error("Error inserting profile:", insertError);
      } else {
        console.log("Profile inserted successfully");
      }
    } else {
      console.log("Profile updated successfully");
    }

    // Create user role as student (if not exists)
    if (!isExistingUser) {
      const { error: userRoleError } = await supabase
        .from("user_roles")
        .upsert({
          user_id: newUserId,
          role: "aluno",
        }, {
          onConflict: 'user_id,role',
          ignoreDuplicates: true
        });

      if (userRoleError) {
        console.error("Error creating user role:", userRoleError);
      }
    }

    // Find or create course by name if courseName provided
    let finalCourseId = courseId;
    let finalCourseName = courseName;

    if (courseName && !courseId) {
      // Check if course exists
      const { data: existingCourse } = await supabase
        .from("courses")
        .select("id, title")
        .eq("title", courseName)
        .single();

      if (existingCourse) {
        finalCourseId = existingCourse.id;
      } else {
        // Create the course
        const { data: newCourse, error: courseCreateError } = await supabase
          .from("courses")
          .insert({
            title: courseName,
            is_active: true,
            workload_hours: 40,
          })
          .select()
          .single();

        if (courseCreateError) {
          console.error("Error creating course:", courseCreateError);
        } else {
          finalCourseId = newCourse.id;
        }
      }
    } else if (courseId) {
      const { data: courseData } = await supabase
        .from("courses")
        .select("title")
        .eq("id", courseId)
        .single();
      finalCourseName = courseData?.title;
    }

    // Demo Polo ID - Gestor
    const DEMO_POLO_ID = 'aee37a07-2f47-4f6f-ba50-0ccde1617b21';
    const isDemoPolo = poloId === DEMO_POLO_ID;
    
    if (isDemoPolo) {
      console.log("DEMO MODE: Polo Gestor detected - simulating signed contract and payments");
    }

    // Create enrollments with pending contract status
    // Support for multiple courses (EJA + Técnico)
    let enrollment = null;
    let enrollmentId = null;
    const allCourseIds = courseIds && courseIds.length > 0 ? courseIds : (finalCourseId ? [finalCourseId] : []);
    const enrollmentIds: string[] = [];
    
    for (const cId of allCourseIds) {
      // For migrated students: no contract, no payment, access unblocked
      // For demo polo: simulate signed contract and active payment status
      let enrollmentInsert: Record<string, unknown>;
      
      if (isMigrated) {
        enrollmentInsert = {
          user_id: newUserId,
          course_id: cId,
          is_active: true,
          contract_status: "signed", // Already signed in previous platform
          payment_status: "paid", // Migrated students have payments managed in previous platform
          access_blocked: false, // Immediate access
          block_reason: null,
          is_migrated: true,
          migration_source: migrationSource || 'moodle',
          migrated_at: new Date().toISOString(),
        };
      } else if (isDemoPolo) {
        // Demo polo: simulate everything as if contract was signed
        enrollmentInsert = {
          user_id: newUserId,
          course_id: cId,
          is_active: true,
          contract_status: "signed", // Simulate signed contract
          contract_signed_at: new Date().toISOString(),
          payment_status: "active", // Simulate active payments
          access_blocked: false, // Grant immediate access
          block_reason: null,
        };
      } else {
        enrollmentInsert = {
          user_id: newUserId,
          course_id: cId,
          is_active: true,
          contract_status: "pending",
          payment_status: "pending",
          access_blocked: true,
          block_reason: "Aguardando assinatura do contrato",
        };
      }

      // Add polo_id if provided
      if (poloId) {
        enrollmentInsert.polo_id = poloId;
        console.log("Polo ID added to enrollment:", poloId);
      }

      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from("enrollments")
        .insert(enrollmentInsert)
        .select()
        .single();

      if (enrollmentError) {
        console.error("Error creating enrollment for course", cId, ":", enrollmentError);
      } else {
        if (!enrollment) {
          enrollment = enrollmentData;
          enrollmentId = enrollmentData.id;
        }
        enrollmentIds.push(enrollmentData.id);
        console.log(`Enrollment created for course ${cId}:`, enrollmentData.id);
        
        // Store split config for later use in payment processing
        if (splitConfig) {
          console.log(`Split configured: ${splitConfig.percentage}% for polo ${splitConfig.poloName} (wallet: ${splitConfig.walletId})`);
        }
        
        // Notify polo users about the new enrollment
        if (poloId) {
          try {
            // Get course name for the notification
            const { data: courseData } = await supabase
              .from('courses')
              .select('title')
              .eq('id', cId)
              .single();
            
            // Get all users linked to this polo
            const { data: poloUsers, error: poloUsersError } = await supabase
              .from('polo_users')
              .select('user_id')
              .eq('polo_id', poloId);
            
            if (poloUsersError) {
              console.error("Error fetching polo users for notification:", poloUsersError);
            } else if (poloUsers && poloUsers.length > 0) {
              const notifications = poloUsers.map(pu => ({
                user_id: pu.user_id,
                title: 'Nova matrícula no seu polo',
                message: `O aluno ${fullName} foi matriculado no curso "${courseData?.title || 'Curso'}" pela central de matrículas.`,
                type: 'enrollment',
                related_id: enrollmentData.id,
                related_type: 'enrollment',
              }));
              
              const { error: notifError } = await supabase
                .from('notifications')
                .insert(notifications);
              
              if (notifError) {
                console.error("Error creating polo notifications:", notifError);
              } else {
                console.log(`Notifications sent to ${poloUsers.length} polo user(s)`);
              }
            }
          } catch (notifErr) {
            console.error("Error in polo notification process:", notifErr);
          }
        }
        
        // For demo polo, create simulated payments
        if (isDemoPolo) {
          const installments = additionalData?.installments || 12;
          const monthlyValue = additionalData?.monthlyValue || 150;
          
          console.log(`DEMO MODE: Creating ${installments} simulated payments for course ${cId}`);
          
          const paymentsToInsert = [];
          const today = new Date();
          
          for (let i = 1; i <= installments; i++) {
            const dueDate = new Date(today);
            dueDate.setMonth(today.getMonth() + i - 1);
            
            // Determine payment status: first 2 paid, 1 overdue, rest pending
            let status = 'PENDING';
            let paidAt = null;
            
            if (i <= 2) {
              status = 'CONFIRMED';
              paidAt = new Date(dueDate);
              paidAt.setDate(paidAt.getDate() - Math.floor(Math.random() * 5));
            } else if (i === 3) {
              status = 'OVERDUE';
            }
            
            paymentsToInsert.push({
              user_id: newUserId,
              course_id: cId,
              amount: monthlyValue,
              status,
              due_date: dueDate.toISOString().split('T')[0],
              paid_at: paidAt ? paidAt.toISOString() : null,
              installment_number: i,
              total_installments: installments,
              payment_method: status === 'CONFIRMED' ? 'BOLETO' : null,
              asaas_payment_id: `demo_${cId.substring(0, 8)}_${i}`, // Fake ID for demo
            });
          }
          
          const { error: paymentsError } = await supabase
            .from('payments')
            .insert(paymentsToInsert);
          
          if (paymentsError) {
            console.error("Error creating demo payments:", paymentsError);
          } else {
            console.log(`DEMO MODE: Created ${installments} simulated payments successfully`);
          }
        }
      }
    }

    console.log(`Total enrollments created: ${enrollmentIds.length}`);
    if (hasDiscount && enrollmentIds.length > 1) {
      console.log(`Discount of ${discountPercentage}% will be applied to payments for EJA + Técnico combination`);
    }

    // Send contract via Assinafy if API key is configured and NOT a migrated/demo student
    let contractSent = false;
    const skipAssinafy = isMigrated || isDemoPolo;
    
    if (isDemoPolo) {
      console.log("DEMO MODE: Skipping Assinafy contract - contract simulated as signed");
      contractSent = true; // Mark as sent for demo purposes
    }
    
    if (asssinafyApiKey && enrollmentId && additionalData?.cpf && !skipAssinafy) {
      try {
        console.log("=== Starting Assinafy contract flow ===");

        // Get course category to determine which PDF to use
        const { data: courseData } = await supabase
          .from("courses")
          .select("title, category")
          .eq("id", finalCourseId)
          .single();

        console.log(`Course: ${courseData?.title}, Category: ${courseData?.category}`);

        // Step 1: Get contract PDF URL from storage
        const contractPdf = await getContractPdfUrl(supabase, courseData?.category || "");
        
        if (!contractPdf) {
          throw new Error(`PDF do contrato não encontrado. Faça upload dos arquivos PDF em Configurações > Contratos.`);
        }
        
        console.log(`Using contract: ${contractPdf.name} (URL: ${contractPdf.url})`)

        // Step 2: Create document with signer from PDF upload
        const contractTitle = `Contrato de Matrícula - ${fullName}`;
        
        const { documentId, signingUrl } = await createDocumentWithSigner(
          asssinafyApiKey,
          asssinafyAccountId,
          contractPdf.url,
          contractTitle,
          {
            name: fullName,
            email: email,
            role: "Aluno",
          }
        );

        if (!documentId) {
          throw new Error("Falha ao criar documento a partir do PDF");
        }

        // Step 3: Send document for signature
        const sent = await sendDocumentForSignature(
          asssinafyApiKey,
          asssinafyAccountId,
          documentId,
          `Olá ${fullName}! Por favor, assine seu contrato de matrícula para o curso ${courseData?.title || 'selecionado'}.`
        );

        if (!sent) {
          console.warn("Send step failed, but document was created with signing URL:", signingUrl);
        }

        console.log("=== Contract sent successfully via Assinafy ===");

        // Update enrollment with contract info
        await supabase
          .from("enrollments")
          .update({
            contract_status: "sent",
            contract_document_id: documentId,
            block_reason: "Aguardando assinatura do contrato",
          })
          .eq("id", enrollmentId);
        
        contractSent = true;
      } catch (asssinafyError) {
        console.error("Error sending contract via Assinafy:", asssinafyError);
      }
    }

    // DO NOT send welcome email here - it will be sent after contract is signed via webhook
    // The sendEmail flag is now ignored for the initial creation
    // Email will be sent by the assinafy-webhook after contract signature
    const emailSent = false;
    console.log("Welcome email will be sent after contract signature");

    // Build message based on what was done
    let message = "Aluno criado com sucesso!";
    const actions = [];
    
    if (isDemoPolo) {
      actions.push("contrato simulado como assinado");
      actions.push("pagamentos fictícios gerados");
    } else if (contractSent) {
      actions.push("contrato enviado para assinatura");
    }
    
    if (actions.length > 0) {
      message = `Aluno criado, ${actions.join(", ")}!`;
    }
    
    // Note: Credentials use CPF as password (or generated if CPF not provided)
    if (!isDemoPolo) {
      message += " Os dados de acesso serão enviados por email após a assinatura do contrato.";
    } else {
      message += " Modo demonstração: acesso liberado imediatamente.";
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUserId,
          email,
          fullName,
        },
        credentials: {
          email,
          password,
          note: additionalData?.cpf ? "Senha = CPF (sem formatação)" : "Senha gerada automaticamente",
        },
        enrollment,
        emailSent,
        contractSent,
        message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error creating student:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generatePassword(): string {
  const length = 12;
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%";
  const all = lowercase + uppercase + numbers + special;
  
  let password = "";
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  return password.split("").sort(() => Math.random() - 0.5).join("");
}

interface EmailTemplateData {
  fullName: string;
  email: string;
  password: string;
  courseName: string | null | undefined;
  loginUrl: string;
  contractSent?: boolean;
}

function generateWelcomeEmailHtml(data: EmailTemplateData): string {
  const { fullName, email, password, courseName, loginUrl, contractSent } = data;
  const currentYear = new Date().getFullYear();
  
  const contractNotice = contractSent ? `
    <tr>
      <td style="padding: 0 40px 40px;">
        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 2px solid #f59e0b; border-radius: 12px; padding: 24px;">
          <h3 style="margin: 0 0 12px; color: #92400e; font-size: 17px; font-weight: 700;">
            📝 Contrato de Matrícula
          </h3>
          <p style="margin: 0; color: #a16207; font-size: 14px; line-height: 1.6;">
            Você receberá em breve um email separado com o contrato de matrícula para assinatura digital. 
            <strong>Após assinar o contrato, os boletos serão gerados automaticamente e seu acesso ao curso será liberado.</strong>
          </p>
        </div>
      </td>
    </tr>
  ` : '';
  
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo à EduPlatform</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(22, 78, 99, 0.1);">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e5bb8 0%, #1f9d8a 100%); padding: 48px 40px; border-radius: 16px 16px 0 0; text-align: center;">
              <div style="margin-bottom: 16px;">
                <span style="display: inline-block; background: rgba(255,255,255,0.15); padding: 12px 20px; border-radius: 12px;">
                  <span style="font-size: 32px;">🎓</span>
                </span>
              </div>
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">
                EduPlatform
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">
                Sua jornada de aprendizado começa agora!
              </p>
            </td>
          </tr>
          
          <!-- Welcome Message -->
          <tr>
            <td style="padding: 48px 40px 32px;">
              <h2 style="margin: 0 0 16px; color: #0f172a; font-size: 26px; font-weight: 700;">
                Olá, ${fullName}! 👋
              </h2>
              <p style="margin: 0; color: #475569; font-size: 16px; line-height: 1.7;">
                ${courseName 
                  ? `Sua matrícula no curso <strong style="color: #1e5bb8;">${courseName}</strong> foi realizada com sucesso!`
                  : 'Sua conta foi criada com sucesso!'}
                Estamos muito felizes em tê-lo(a) conosco nessa jornada de conhecimento.
              </p>
            </td>
          </tr>
          
          ${contractNotice}
          
          <!-- Credentials Card -->
          <tr>
            <td style="padding: 0 40px 40px;">
              <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #0ea5e9; border-radius: 12px; padding: 28px;">
                <h3 style="margin: 0 0 20px; color: #0369a1; font-size: 18px; font-weight: 700; display: flex; align-items: center;">
                  🔐 Seus Dados de Acesso
                </h3>
                
                <div style="background: #ffffff; border-radius: 8px; padding: 16px; margin-bottom: 12px; border: 1px solid #bae6fd;">
                  <p style="margin: 0 0 4px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                    E-mail
                  </p>
                  <p style="margin: 0; color: #0f172a; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace;">
                    ${email}
                  </p>
                </div>
                
                <div style="background: #ffffff; border-radius: 8px; padding: 16px; border: 1px solid #bae6fd;">
                  <p style="margin: 0 0 4px; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Senha
                  </p>
                  <p style="margin: 0; color: #0f172a; font-size: 16px; font-weight: 600; font-family: 'Courier New', monospace;">
                    ${password}
                  </p>
                </div>
                
                <p style="margin: 16px 0 0; color: #0369a1; font-size: 13px; line-height: 1.5;">
                  💡 <strong>Dica:</strong> Recomendamos que você altere sua senha após o primeiro acesso para maior segurança.
                </p>
              </div>
            </td>
          </tr>
          
          <!-- CTA Button -->
          <tr>
            <td style="padding: 0 40px 48px; text-align: center;">
              <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #1e5bb8 0%, #1f9d8a 100%); color: #ffffff; text-decoration: none; padding: 18px 48px; border-radius: 10px; font-size: 16px; font-weight: 700; box-shadow: 0 4px 14px rgba(30, 91, 184, 0.4);">
                🚀 Acessar Plataforma
              </a>
              <p style="margin: 16px 0 0; color: #94a3b8; font-size: 13px;">
                ou acesse: <a href="${loginUrl}" style="color: #1e5bb8;">${loginUrl}</a>
              </p>
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <div style="border-top: 1px solid #e2e8f0;"></div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px; text-align: center;">
              <p style="margin: 0 0 8px; color: #94a3b8; font-size: 13px;">
                © ${currentYear} EduPlatform. Todos os direitos reservados.
              </p>
              <p style="margin: 0; color: #cbd5e1; font-size: 12px;">
                Este email foi enviado porque você foi cadastrado em nossa plataforma.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
