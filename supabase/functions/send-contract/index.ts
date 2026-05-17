import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendContractRequest {
  enrollmentId: string;
  studentName: string;
  studentEmail: string;
  studentCpf: string;
  courseName: string;
  courseCategory?: string;
  monthlyValue: number;
  installments: number;
  dueDate: string;
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


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const asssinafyApiKey = Deno.env.get("ASSINAFY_API_KEY")!;
    const asssinafyAccountId = Deno.env.get("ASSINAFY_ACCOUNT_ID") || "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      enrollmentId,
      studentName, 
      studentEmail, 
      studentCpf,
      courseName,
      courseCategory,
      monthlyValue, 
      installments,
      dueDate 
    }: SendContractRequest = await req.json();

    console.log("=== Sending contract via Assinafy for enrollment:", enrollmentId, "===");
    console.log(`Course: ${courseName}, Category: ${courseCategory}`);

    // Step 1: Get contract PDF URL from storage
    const contractPdf = await getContractPdfUrl(supabase, courseCategory || "");
    
    if (!contractPdf) {
      throw new Error(`PDF do contrato não encontrado. Faça upload dos arquivos PDF em Configurações > Contratos.`);
    }
    
    console.log(`Using contract: ${contractPdf.name} (URL: ${contractPdf.url})`)

    // Step 2: Create document with signer from PDF upload
    const contractTitle = `Contrato de Matrícula - ${studentName}`;
    
    const { documentId, signingUrl } = await createDocumentWithSigner(
      asssinafyApiKey,
      asssinafyAccountId,
      contractPdf.url,
      contractTitle,
      {
        name: studentName,
        email: studentEmail,
        role: "Aluno",
      }
    );

    if (!documentId) {
      throw new Error("Falha ao criar documento a partir do PDF");
    }

    // Assignment already sends the signature request automatically via email
    console.log("=== Contract sent successfully via Assinafy ===");
    console.log("Signing URL:", signingUrl);

    // Update enrollment with contract status
    const { error: updateError } = await supabase
      .from("enrollments")
      .update({
        contract_status: "sent",
        contract_document_id: documentId,
      })
      .eq("id", enrollmentId);

    if (updateError) {
      console.error("Error updating enrollment:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentId: documentId,
        message: "Contrato enviado com sucesso via Assinafy",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error sending contract:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
