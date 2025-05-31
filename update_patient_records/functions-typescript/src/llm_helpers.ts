import { Function } from "@foundry/functions-api";
import { Objects } from "@foundry/ontology-api";
import { GPT_4o, TextEmbeddingAda_002 } from "@foundry/models-api/language-models";
import { Edits, OntologyEditFunction, Integer, LocalDate, Double, Timestamp } from "@foundry/functions-api";


export interface DiagnosisResult {
  description: string;
  score: number;
  tests: string[];
}

export interface LLMResult {
  severity: number;
  diagnoses: string[];
  tests: string[];
  reasons?: string;
}

export function cosineSimilarity(vec1: Double[], vec2: Double[]): number {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (mag1 * mag2);
  }

export async function processSearchResults(symptoms: string): Promise<DiagnosisResult[]> {
  const trimmedSymptoms = symptoms?.trim();
  if (!trimmedSymptoms) return [];

  const items = trimmedSymptoms
    .split(',')
    .map(s => s.trim().toLowerCase())
    .sort()
    .toString();

  const queryEmbedding = await TextEmbeddingAda_002.createEmbeddings({ inputs: [items] })
    .then(r => r.embeddings[0]);

  const searchResults = await Objects.search()
    .diagnosis()
    .nearestNeighbors(obj => obj.embeddedSymptoms.near(queryEmbedding, { kValue: 10 }))
    .orderByRelevance()
    .takeAsync(5);

  const processedResults: DiagnosisResult[] = await Promise.all(
    searchResults.map(async (item) => {
      const itemEmbedding = item.embeddedSymptoms as Double[];
      const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);
      return {
        description: item.description ?? "",
        score: similarity,
        tests: Array.isArray(item.tests) ? [...item.tests] : [], // ensure mutable array
      };
    })
  );

  return processedResults
    .filter(r => r.score > 0.85)
    .sort((a, b) => b.score - a.score);
}


export async function getLlmInsights(
  symptoms: string,
  initial_candidates: DiagnosisResult[],
  initial_suggestions: string[],
  patient_id: string,
  history?: string,
  whatHappened?: string
): Promise<LLMResult> {
  const pastDiagnoses = Objects.search()
    .patientRecord()
    .filter(pr => pr.patientId.exactMatch(patient_id))
    .all()
    .map(r => r.diagnosis)
    .filter(Boolean);

  const systemMessage = {
  role: "SYSTEM",
  contents: [{
    text: `You are an AI assistant supporting triage decisions in a hospital emergency setting.
    You will receive structured patient information, including some or all of:
    - Reported symptoms
    - Medical history
    - Recent events (what happened)
    - Past diagnoses
    - A list of candidate diagnoses
    - A list of suggested diagnostic tests

    Your task is to:
    1. Select the two most appropriate diagnoses from the candidate list. If none fit, suggest more appropriate ones using the patient's symptoms and medical history.
    2. Provide a short, clear clinical justification for the chosen diagnoses. This reasoning must be based on the patient's symptoms and medical history, but do not mention given candidates.
    3. Select relevant tests from the suggested list. If none are suitable, suggest better ones or leave the list empty.
    4. Assign a severity score from 1 to 3 based only on symptoms and urgency — do NOT infer severity from diagnosis alone.

    Return ONLY a valid JSON object in the exact format:
    {
      "severity": 1 | 2 | 3,
      "diagnoses": ["Diagnosis A", "Diagnosis B"],
      "reasons": "Concise explanation based on symptoms and history.",
      "tests": ["Test A", "Test B"]
    }

    ⚠️ Do not include any explanation, markdown, formatting, or extra text. Only the JSON object.`
      }]
    };


  const prompt = `
Patient Intake Data:

Symptoms: ${symptoms}.
${history ? `Medical History: ${history}.` : ""}
${pastDiagnoses.length ? `Past Diagnoses: ${pastDiagnoses.join(", ")}.` : ""}
${whatHappened ? `Recent Event: ${whatHappened}.` : ""}
${initial_candidates.length ? `Candidate Diagnoses: ${initial_candidates.map(c => c.description).join(", ")}.` : ""}
${initial_suggestions.length ? `Suggested Tests: ${initial_suggestions.join(", ")}.` : ""}

Triage Severity Definitions:
1 = Immediate attention — critical or life-threatening  
2 = High priority — serious, but can wait briefly  
3 = Lower priority — stable, non-urgent

Instructions:
- Base the diagnosis selection on both the reported symptoms and the patient's history.
- Use this same information to justify your reasoning.
- Do not assume the diagnosis should determine severity — base severity only on urgency of the presented condition.

Return only the JSON object.`;

  const userMessage = {
    role: "USER",
    contents: [{ text: prompt }]
  };

  const response = await GPT_4o.createChatCompletion({
    messages: [systemMessage, userMessage],
    params: { temperature: 0 }
  });

  const raw = response.choices?.[0]?.message?.content?.trim();

  try {
    const match = raw?.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in model response");

    const parsed = JSON.parse(match[0]);

    if (
      typeof parsed.severity === "number" &&
      Array.isArray(parsed.diagnoses) &&
      Array.isArray(parsed.tests)
    ) {
      return parsed as LLMResult;
    }

    throw new Error("Invalid structure from model");
  } catch (e) {
    console.error("LLM response error:", e);
    return {
      severity: 2,
      diagnoses: initial_candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(d => d.description),
      tests: [],
    };
  }
}
