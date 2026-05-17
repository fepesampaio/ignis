import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync, gunzipSync, strFromU8 } from "https://esm.sh/fflate@0.8.2";
import { Untar } from "https://deno.land/std@0.168.0/archive/untar.ts";
import { Buffer } from "https://deno.land/std@0.168.0/io/buffer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedQuestion {
  questionText: string;
  points: number;
  options: { text: string; isCorrect: boolean }[];
  quizName?: string;
  quizId?: string;
}

interface QuizInfo {
  id: string;
  name: string;
  questionCount: number;
}

interface ParsedResult {
  quizzes: QuizInfo[];
  questions: ParsedQuestion[];
  totalQuestions: number;
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
  };
  
  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }
  
  // Decode numeric entities like &#60; &#x3c;
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  return result;
}

// Strip HTML tags but keep text
function stripHtmlTags(text: string): string {
  if (!text) return "";
  // Remove HTML tags but preserve text content
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Clean HTML and CDATA from text
function cleanText(text: string): string {
  if (!text) return "";
  // Remove CDATA
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
  // Decode HTML entities
  text = decodeHtmlEntities(text);
  // Strip HTML tags
  text = stripHtmlTags(text);
  return text.trim();
}

// Parse Moodle XML question format and return map of questionBankEntryId -> question
function parseQuestionsXML(xmlContent: string, filename?: string): Map<string, { text: string; points: number; options: { text: string; isCorrect: boolean }[] }> {
  const questions = new Map<string, { text: string; points: number; options: { text: string; isCorrect: boolean }[] }>();
  
  // Log first 2000 chars for debugging
  if (filename) {
    console.log(`Parsing ${filename}, content preview:`, xmlContent.substring(0, 2000));
  }
  
  // Try Format 1: Moodle 4.x with <question_bank_entry id="X">
  const entryRegex = /<question_bank_entry\s+id="(\d+)"[^>]*>([\s\S]*?)<\/question_bank_entry>/gi;
  let entryMatch;
  
  while ((entryMatch = entryRegex.exec(xmlContent)) !== null) {
    const entryId = entryMatch[1];
    const entryBlock = entryMatch[2];
    
    // Find questions block inside
    const questionsBlockMatch = /<questions>([\s\S]*?)<\/questions>/i.exec(entryBlock);
    if (!questionsBlockMatch) continue;
    
    const questionsBlock = questionsBlockMatch[1];
    
    // Check if it's a multichoice question
    const qtypeMatch = /<qtype>multichoice<\/qtype>/i.exec(questionsBlock);
    if (!qtypeMatch) continue;
    
    // Extract question text
    let questionText = "";
    const questionTextMatch = /<questiontext>([\s\S]*?)<\/questiontext>/i.exec(questionsBlock);
    if (questionTextMatch) {
      const textMatch = /<text>([\s\S]*?)<\/text>/i.exec(questionTextMatch[1]);
      if (textMatch) {
        questionText = cleanText(textMatch[1]);
      }
    }
    
    if (!questionText) {
      const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(questionsBlock);
      if (nameMatch) {
        questionText = cleanText(nameMatch[1]);
      }
    }
    
    if (!questionText) continue;
    
    const defaultGradeMatch = /<defaultmark>([\d.]+)<\/defaultmark>/i.exec(questionsBlock);
    const points = Math.max(1, Math.round(parseFloat(defaultGradeMatch?.[1] || "1")));
    
    const answersBlockMatch = /<question_answers>([\s\S]*?)<\/question_answers>/i.exec(entryBlock);
    const options: { text: string; isCorrect: boolean }[] = [];
    
    if (answersBlockMatch) {
      const answersBlock = answersBlockMatch[1];
      const answerRegex = /<question_answer\s+[^>]*>([\s\S]*?)<\/question_answer>/gi;
      let answerMatch;
      
      while ((answerMatch = answerRegex.exec(answersBlock)) !== null) {
        const answerBlock = answerMatch[1];
        const answerTextMatch = /<answertext>([\s\S]*?)<\/answertext>/i.exec(answerBlock);
        let answerText = "";
        if (answerTextMatch) {
          answerText = cleanText(answerTextMatch[1]);
        }
        
        const fractionMatch = /<fraction>([\d.-]+)<\/fraction>/i.exec(answerBlock);
        const fraction = parseFloat(fractionMatch?.[1] || "0");
        
        if (answerText) {
          options.push({
            text: answerText,
            isCorrect: fraction > 0,
          });
        }
      }
    }
    
    if (options.length >= 2) {
      questions.set(entryId, { text: questionText, points, options });
      console.log(`Format1: Found question entry ${entryId}: "${questionText.substring(0, 50)}..." with ${options.length} options`);
    }
  }
  
  console.log(`Format1 (question_bank_entry) found ${questions.size} questions`);
  
  // Try Format 2: <question_categories> -> <question_category> -> <question_bank_entries> -> <question_bank_entry>
  if (questions.size === 0) {
    console.log("Trying Format2: question_categories with question_bank_entries...");
    
    // This format has question_bank_entry inside question_category
    const categoryRegex = /<question_category\s+id="(\d+)"[^>]*>([\s\S]*?)<\/question_category>/gi;
    let categoryMatch;
    
    while ((categoryMatch = categoryRegex.exec(xmlContent)) !== null) {
      const categoryBlock = categoryMatch[2];
      
      // Find <question_bank_entries> block inside category
      const entriesBlockMatch = /<question_bank_entries>([\s\S]*?)<\/question_bank_entries>/i.exec(categoryBlock);
      if (!entriesBlockMatch) continue;
      
      const entriesBlock = entriesBlockMatch[1];
      
      // Find each <question_bank_entry id="X">
      const entryRegex2 = /<question_bank_entry\s+id="(\d+)"[^>]*>([\s\S]*?)<\/question_bank_entry>/gi;
      let entryMatch2;
      
      while ((entryMatch2 = entryRegex2.exec(entriesBlock)) !== null) {
        const entryId = entryMatch2[1]; // This is the ID referenced by quizzes!
        const entryBlock = entryMatch2[2];
        
        // Find <question> inside - get the actual question data
        const questionMatch = /<question\s+id="(\d+)"[^>]*>([\s\S]*?)<\/question>/i.exec(entryBlock);
        if (!questionMatch) continue;
        
        const questionBlock = questionMatch[2];
        
        // Check if it's multichoice
        const qtypeMatch = /<qtype>multichoice<\/qtype>/i.exec(questionBlock);
        if (!qtypeMatch) continue;
        
        // Extract question text - try <questiontext> first (may contain encoded HTML)
        let questionText = "";
        const questionTextMatch = /<questiontext>([\s\S]*?)<\/questiontext>/i.exec(questionBlock);
        if (questionTextMatch) {
          questionText = cleanText(questionTextMatch[1]);
        }
        
        // Fallback to <name>
        if (!questionText) {
          const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(questionBlock);
          if (nameMatch) {
            questionText = cleanText(nameMatch[1]);
          }
        }
        
        if (!questionText) continue;
        
        // Extract points from <defaultmark>
        const defaultMarkMatch = /<defaultmark>([\d.]+)<\/defaultmark>/i.exec(questionBlock);
        const points = Math.max(1, Math.round(parseFloat(defaultMarkMatch?.[1] || "1")));
        
        // Extract answers - in this format they are in <plugin_qtype_multichoice_question><answers><answer>
        const options: { text: string; isCorrect: boolean }[] = [];
        
        // Look for <answers> block (can be in plugin section or directly in entry)
        const answersBlockMatch = /<answers>([\s\S]*?)<\/answers>/i.exec(entryBlock);
        if (answersBlockMatch) {
          const answersBlock = answersBlockMatch[1];
          
          // Each <answer id="X">
          const answerRegex2 = /<answer\s+id="(\d+)"[^>]*>([\s\S]*?)<\/answer>/gi;
          let answerMatch2;
          
          while ((answerMatch2 = answerRegex2.exec(answersBlock)) !== null) {
            const answerBlock = answerMatch2[2];
            
            // Get answer text from <answertext>
            let answerText = "";
            const answerTextMatch = /<answertext>([\s\S]*?)<\/answertext>/i.exec(answerBlock);
            if (answerTextMatch) {
              answerText = cleanText(answerTextMatch[1]);
            }
            
            // Get fraction to determine if correct - Moodle uses 100 for correct, 0 for incorrect
            // But some versions use 1.0 or other values, so check for > 0
            const fractionMatch = /<fraction>([\d.-]+)<\/fraction>/i.exec(answerBlock);
            const fractionRaw = fractionMatch?.[1] || "0";
            const fraction = parseFloat(fractionRaw);
            
            // Log fraction values for debugging
            console.log(`Answer option: "${answerText.substring(0, 40)}..." fraction raw="${fractionRaw}" parsed=${fraction}`);
            
            if (answerText) {
              // Consider correct if fraction > 0 (covers both 100 and 1.0 formats)
              options.push({
                text: answerText,
                isCorrect: fraction > 0,
              });
            }
          }
        }
        
        if (options.length >= 2) {
          // KEY FIX: Use entryId (question_bank_entry id), NOT question id
          questions.set(entryId, { text: questionText, points, options });
          console.log(`Format2: Found question bank entry ${entryId}: "${questionText.substring(0, 50)}..." with ${options.length} options`);
        }
      }
    }
    
    console.log(`Format2 (question_categories with entries) found ${questions.size} questions`);
  }
  
  // Try Format 3: Legacy format <question type="multichoice">
  if (questions.size === 0) {
    console.log("Trying Format3: legacy question format...");
    
    const legacyRegex = /<question\s+[^>]*type\s*=\s*["']multichoice["'][^>]*>([\s\S]*?)<\/question>/gi;
    let legacyMatch;
    let idx = 0;
    
    while ((legacyMatch = legacyRegex.exec(xmlContent)) !== null) {
      const questionBlock = legacyMatch[1];
      
      const questionTextMatch = /<questiontext[^>]*>[\s\S]*?<text>([\s\S]*?)<\/text>/i.exec(questionBlock);
      const questionText = questionTextMatch ? cleanText(questionTextMatch[1]) : "";
      
      if (!questionText) continue;
      
      const options: { text: string; isCorrect: boolean }[] = [];
      const answerRegex = /<answer\s+[^>]*fraction="([^"]*)"[^>]*>[\s\S]*?<text>([\s\S]*?)<\/text>/gi;
      let answerMatch;
      
      while ((answerMatch = answerRegex.exec(questionBlock)) !== null) {
        const fraction = parseFloat(answerMatch[1] || "0");
        const optionText = cleanText(answerMatch[2]);
        
        if (optionText) {
          options.push({
            text: optionText,
            isCorrect: fraction >= 100,
          });
        }
      }
      
      if (options.length >= 2) {
        questions.set(`legacy_${idx}`, { text: questionText, points: 1, options });
        idx++;
      }
    }
    
    console.log(`Format3 (legacy) found ${idx} questions`);
  }
  
  return questions;
}

// Extract question IDs referenced in a quiz
function extractQuizQuestionIds(quizXmlContent: string): string[] {
  const questionIds: string[] = [];
  
  // Pattern 1: <questionbankentryid> - most reliable for Moodle 4.x
  const entryRegex = /<questionbankentryid>(\d+)<\/questionbankentryid>/gi;
  let match;
  while ((match = entryRegex.exec(quizXmlContent)) !== null) {
    if (!questionIds.includes(match[1])) {
      questionIds.push(match[1]);
    }
  }
  
  // Pattern 2: <question_instance> with <questionid>
  const instanceRegex = /<question_instance[^>]*>[\s\S]*?<questionid>(\d+)<\/questionid>/gi;
  while ((match = instanceRegex.exec(quizXmlContent)) !== null) {
    if (!questionIds.includes(match[1])) {
      questionIds.push(match[1]);
    }
  }
  
  // Pattern 3: <slot> with <questionid>
  const slotRegex = /<slot[^>]*>[\s\S]*?<questionid>(\d+)<\/questionid>/gi;
  while ((match = slotRegex.exec(quizXmlContent)) !== null) {
    if (!questionIds.includes(match[1])) {
      questionIds.push(match[1]);
    }
  }
  
  // Pattern 4: <question_reference> with questionbankentryid
  const refRegex = /<question_reference[^>]*>[\s\S]*?<questionbankentryid>(\d+)<\/questionbankentryid>/gi;
  while ((match = refRegex.exec(quizXmlContent)) !== null) {
    if (!questionIds.includes(match[1])) {
      questionIds.push(match[1]);
    }
  }
  
  console.log(`extractQuizQuestionIds found ${questionIds.length} unique IDs:`, questionIds);
  
  return questionIds;
}

// Extract quiz name from quiz.xml
function extractQuizName(xmlContent: string): string | null {
  const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(xmlContent);
  if (nameMatch) {
    const textMatch = /<text>([\s\S]*?)<\/text>/i.exec(nameMatch[1]);
    if (textMatch) {
      return cleanText(textMatch[1]);
    }
    return cleanText(nameMatch[1]);
  }
  return null;
}

// Extract activity name from activity directory
function extractActivityName(files: Record<string, Uint8Array>, activityPath: string): string | null {
  // Try quiz.xml first
  const quizXmlPath = `${activityPath}/quiz.xml`;
  if (files[quizXmlPath]) {
    try {
      const content = strFromU8(files[quizXmlPath]);
      const name = extractQuizName(content);
      if (name) return name;
    } catch (e) {
      console.log("Error reading quiz.xml:", e);
    }
  }
  
  // Try module.xml
  const moduleXmlPath = `${activityPath}/module.xml`;
  if (files[moduleXmlPath]) {
    try {
      const content = strFromU8(files[moduleXmlPath]);
      const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(content);
      if (nameMatch) return cleanText(nameMatch[1]);
    } catch (e) {
      console.log("Error reading module.xml:", e);
    }
  }
  
  return null;
}

// Detect file format and extract files
async function extractMbzFiles(fileData: Uint8Array): Promise<Record<string, Uint8Array>> {
  console.log("Detecting file format, first bytes:", fileData.slice(0, 4));
  
  // Check for ZIP magic number (PK..)
  const isZip = fileData[0] === 0x50 && fileData[1] === 0x4B;
  
  // Check for GZIP magic number (1f 8b)
  const isGzip = fileData[0] === 0x1F && fileData[1] === 0x8B;
  
  console.log("Format detection - isZip:", isZip, "isGzip:", isGzip);
  
  if (isZip) {
    // Standard ZIP file
    console.log("Processing as ZIP file");
    return unzipSync(fileData);
  } else if (isGzip) {
    // GZIP compressed file (likely .tar.gz)
    console.log("Processing as GZIP file (tar.gz)");
    
    // Decompress gzip
    const decompressed = gunzipSync(fileData);
    console.log("Decompressed GZIP, size:", decompressed.length);
    
    // Check if it's a TAR archive
    const files: Record<string, Uint8Array> = {};
    
    try {
      const reader = new Buffer(decompressed);
      const untar = new Untar(reader);
      
      for await (const entry of untar) {
        if (entry.type === "file") {
          // Read file content dynamically
          const chunks: Uint8Array[] = [];
          const buf = new Uint8Array(4096);
          let bytesRead: number | null;
          
          while ((bytesRead = await entry.read(buf)) !== null) {
            chunks.push(buf.slice(0, bytesRead));
          }
          
          // Concatenate chunks
          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const content = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            content.set(chunk, offset);
            offset += chunk.length;
          }
          
          files[entry.fileName] = content;
        }
      }
      
      console.log("Extracted", Object.keys(files).length, "files from tar.gz");
      return files;
    } catch (tarError) {
      console.log("Not a valid TAR, treating as raw gzip content:", tarError);
      // If not a TAR, just return decompressed content
      return { "content.xml": decompressed };
    }
  } else {
    // Try as plain ZIP anyway (some files may have incorrect headers)
    console.log("Unknown format, attempting as ZIP");
    try {
      return unzipSync(fileData);
    } catch (e) {
      console.error("Failed to extract as ZIP:", e);
      throw new Error("Formato de arquivo não suportado. O arquivo deve ser um backup do Moodle válido (.mbz)");
    }
  }
}

// Process .mbz file (Moodle backup - ZIP or GZIP format)
async function processMbzFile(fileData: Uint8Array): Promise<ParsedResult> {
  console.log("Processing MBZ file, size:", fileData.length);
  
  // Extract files based on format
  const files = await extractMbzFiles(fileData);
  
  const fileList = Object.keys(files);
  console.log("Archive contains", fileList.length, "files");
  console.log("ZIP contains", fileList.length, "files");
  
  const result: ParsedResult = {
    quizzes: [],
    questions: [],
    totalQuestions: 0,
  };
  
  // Find all quiz activities
  const quizActivities: { id: string; path: string; name: string }[] = [];
  
  for (const filename of fileList) {
    const quizMatch = filename.match(/activities\/quiz_(\d+)\/quiz\.xml$/);
    if (quizMatch) {
      const quizId = quizMatch[1];
      const path = filename.replace("/quiz.xml", "");
      const name = extractActivityName(files, path);
      quizActivities.push({
        id: quizId,
        path,
        name: name || `Quiz ${quizId}`,
      });
    }
  }
  
  console.log("Found", quizActivities.length, "quiz activities");
  
  // First, parse all question bank files to build a map of question ID -> question data
  const questionBank = new Map<string, { text: string; points: number; options: { text: string; isCorrect: boolean }[] }>();
  
  // Find and parse all questions.xml files in the backup
  for (const filename of fileList) {
    if (filename.includes("questions.xml")) {
      if (files[filename]) {
        try {
          const content = strFromU8(files[filename]);
          const parsed = parseQuestionsXML(content, filename);
          console.log(`Parsed ${parsed.size} questions from ${filename}`);
          
          // Merge into question bank
          parsed.forEach((value, key) => {
            questionBank.set(key, value);
          });
        } catch (e) {
          console.error(`Error parsing ${filename}:`, e);
        }
      }
    }
  }
  
  console.log("Total questions in bank:", questionBank.size);
  
  // If no questions found by ID, try scanning for question elements differently
  if (questionBank.size === 0) {
    console.log("No questions found by ID, scanning all XML files...");
    
    for (const filename of fileList) {
      if (filename.endsWith(".xml") && files[filename]) {
        try {
          const content = strFromU8(files[filename]);
          
          // Look for multichoice question patterns with different formats
          const altRegex = /<question[^>]*type\s*=\s*["']multichoice["'][^>]*>([\s\S]*?)<\/question>/gi;
          let match;
          let idx = 0;
          
          while ((match = altRegex.exec(content)) !== null) {
            const questionBlock = match[1];
            
            // Extract question text
            const questionTextMatch = /<questiontext[^>]*>[\s\S]*?<text>([\s\S]*?)<\/text>/i.exec(questionBlock);
            const questionText = questionTextMatch ? cleanText(questionTextMatch[1]) : "";
            
            if (!questionText) continue;
            
            // Extract points
            const defaultGradeMatch = /<defaultgrade>([\d.]+)<\/defaultgrade>/i.exec(questionBlock);
            const points = Math.max(1, Math.round(parseFloat(defaultGradeMatch?.[1] || "1")));
            
            // Extract answers
            const answerRegex = /<answer\s+[^>]*fraction="([^"]*)"[^>]*>[\s\S]*?<text>([\s\S]*?)<\/text>/gi;
            const options: { text: string; isCorrect: boolean }[] = [];
            let answerMatch;
            
            while ((answerMatch = answerRegex.exec(questionBlock)) !== null) {
              const fraction = parseFloat(answerMatch[1] || "0");
              const optionText = cleanText(answerMatch[2]);
              
              if (optionText) {
                options.push({
                  text: optionText,
                  isCorrect: fraction >= 100,
                });
              }
            }
            
            if (options.length >= 2) {
              const fakeId = `${filename}_${idx}`;
              questionBank.set(fakeId, { text: questionText, points, options });
              idx++;
            }
          }
          
          if (idx > 0) {
            console.log(`Found ${idx} multichoice questions in ${filename} (alternative format)`);
          }
        } catch (e) {
          // Ignore errors
        }
      }
    }
    
    console.log("Total questions after alt scan:", questionBank.size);
  }
  
  // Now process each quiz and associate questions
  for (const quiz of quizActivities) {
    const quizXmlPath = `${quiz.path}/quiz.xml`;
    
    if (files[quizXmlPath]) {
      try {
        const quizContent = strFromU8(files[quizXmlPath]);
        const questionIds = extractQuizQuestionIds(quizContent);
        
        console.log(`Quiz "${quiz.name}": references ${questionIds.length} questions`);
        
        // Get questions for this quiz
        const quizQuestions: ParsedQuestion[] = [];
        
        for (const qId of questionIds) {
          const q = questionBank.get(qId);
          if (q) {
            quizQuestions.push({
              questionText: q.text,
              points: q.points,
              options: q.options,
              quizName: quiz.name,
              quizId: quiz.id,
            });
          }
        }
        
        if (quizQuestions.length > 0) {
          result.questions.push(...quizQuestions);
          result.quizzes.push({
            id: quiz.id,
            name: quiz.name,
            questionCount: quizQuestions.length,
          });
          console.log(`Quiz "${quiz.name}": added ${quizQuestions.length} questions`);
        }
      } catch (e) {
        console.error(`Error processing quiz ${quiz.name}:`, e);
      }
    }
  }
  
  // If still no questions associated with quizzes but we have questions in bank,
  // try to distribute them by order or associate all to a single group
  if (result.questions.length === 0 && questionBank.size > 0) {
    console.log("Questions found but not associated, creating groups...");
    
    // If we have quizzes, try to divide questions evenly
    if (quizActivities.length > 0) {
      const allQuestions = Array.from(questionBank.values());
      const questionsPerQuiz = Math.ceil(allQuestions.length / quizActivities.length);
      
      for (let i = 0; i < quizActivities.length; i++) {
        const quiz = quizActivities[i];
        const startIdx = i * questionsPerQuiz;
        const endIdx = Math.min(startIdx + questionsPerQuiz, allQuestions.length);
        const quizQuestions = allQuestions.slice(startIdx, endIdx);
        
        if (quizQuestions.length > 0) {
          for (const q of quizQuestions) {
            result.questions.push({
              questionText: q.text,
              points: q.points,
              options: q.options,
              quizName: quiz.name,
              quizId: quiz.id,
            });
          }
          result.quizzes.push({
            id: quiz.id,
            name: quiz.name,
            questionCount: quizQuestions.length,
          });
        }
      }
    } else {
      // No quizzes, create a single group
      for (const [id, q] of questionBank) {
        result.questions.push({
          questionText: q.text,
          points: q.points,
          options: q.options,
          quizName: "Banco de Questões",
          quizId: "bank",
        });
      }
      if (result.questions.length > 0) {
        result.quizzes.push({
          id: "bank",
          name: "Banco de Questões",
          questionCount: result.questions.length,
        });
      }
    }
  }
  
  result.totalQuestions = result.questions.length;
  
  console.log("Total quizzes:", result.quizzes.length);
  console.log("Total questions:", result.totalQuestions);
  
  return result;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Verify user is admin
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    // Check if user is admin
    const { data: userRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!userRole || userRole.role !== "admin") {
      throw new Error("Only admins can import questions");
    }

    // Get the file from form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      throw new Error("No file provided");
    }

    console.log("Received file:", file.name, "size:", file.size);

    // Check file extension
    if (!file.name.toLowerCase().endsWith(".mbz")) {
      throw new Error("Invalid file format. Please upload a .mbz file");
    }

    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const fileData = new Uint8Array(arrayBuffer);

    // Process the MBZ file
    const result = await processMbzFile(fileData);

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing MBZ file:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
