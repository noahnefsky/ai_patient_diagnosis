import { Edits, OntologyEditFunction, Integer, LocalDate, Double, Timestamp } from "@foundry/functions-api";
import { Patient, Objects, PatientRecord } from "@foundry/ontology-api";
import { TextEmbeddingAda_002, GPT_4o } from "@foundry/models-api/language-models";
import { getLlmInsights, DiagnosisResult, LLMResult, processSearchResults, cosineSimilarity } from "./llm_helpers";


export class EditPatientFunctions {
  @OntologyEditFunction()
  @Edits(Patient)
  public async searchOrCreatePatient(patientId: string): Promise<void> {
    const trimmedId = patientId?.trim();
    if (!trimmedId) return;

    const existing = Objects.search()
      .patient()
      .filter(p => p.patientId.exactMatch(trimmedId))
      .all();

    if (existing.length === 0) {
      Objects.create().patient(trimmedId);
    }
  }

  @OntologyEditFunction()
  @Edits(Patient, PatientRecord)
  public async createNewPatientRecord(
    patientId: string,
    symptoms?: string,
    medications?: string,
    history?: string,
    whatHappened?: string
  ): Promise<void> {
    const trimmedId = patientId?.trim();
    const trimmedSymptoms = symptoms?.trim();
    const trimmedMedications = medications?.trim();
    const trimmedHistory = history?.trim();
    const trimmedWhatHappened = whatHappened?.trim();

    const [patient] = Objects.search()
      .patient()
      .filter(p => p.patientId.exactMatch(trimmedId))
      .all();

    if (!patient) {
      console.log(`No Patient found with ID ${trimmedId}. Nothing to update.`);
      return;
    }

    const allRecords = Objects.search().patientRecord().all();
    const lastrecords = allRecords
      .filter((pr) => pr.patientId?.trim() === trimmedId)
      .sort((a, b) => {
        const indexA = a?.index ?? -Infinity;
        const indexB = b?.index ?? -Infinity;
        return indexB - indexA;
      });

    let index = 0;
    if (lastrecords.length > 0 && lastrecords[0].index !== undefined) {
      index = lastrecords[0].index + 1;
    }

    const newRecord = Objects.create().patientRecord(`${trimmedId}-${index}`);
    newRecord.date = LocalDate.now();
    newRecord.patientId = patientId;
    newRecord.index = index;
    newRecord.complete = false;
    newRecord.timesSeenInVisit = 0;
    newRecord.timeStamp = Timestamp.now();

    if (trimmedSymptoms) {
      const initial_canadidates = await processSearchResults(trimmedSymptoms);
      const initial_suggestions = initial_canadidates.map(c =>
          c.tests
            .map(t => t.charAt(0).toUpperCase() + t.slice(1))
            .join(", ")
        );
      const llm_response = await getLlmInsights(symptoms ?? "", initial_canadidates, initial_suggestions, patientId, history, whatHappened);
      newRecord.severity = llm_response.severity;
      if (llm_response) {
        newRecord.candidates = llm_response.diagnoses;
        newRecord.suggestions = llm_response.tests;
        if (llm_response.reasons) {
          newRecord.aiReasoning = llm_response.reasons;
        }
      }
      newRecord.symptoms = trimmedSymptoms;
    }

    if (trimmedHistory) {
      newRecord.history = trimmedHistory;
    }

    if (trimmedWhatHappened) {
      newRecord.whatHappened = trimmedWhatHappened;
    }

    if (trimmedMedications) {
      patient.medications = trimmedMedications;
    }
  }

  @OntologyEditFunction()
  @Edits(Patient)
  public updateRecord(
    recordId: string,
    symptoms?: string,
    tests?: string,
    history?: string,
    medications?: string,
    diagnosis?: string,
    treatment?: string,
    result?: string,
    whatHappened?: string,
  ): void {
    const trimmedRecordId = recordId?.trim();
    const trimmedSymptoms = symptoms?.trim();
    const trimmedTests = tests?.trim();
    const trimmedHistory = history?.trim();
    const trimmedMedications = medications?.trim();
    const trimmedDiagnosis = diagnosis?.trim();
    const trimmedTreatment = treatment?.trim();
    const trimmedResult = result?.trim();
    const trimmedWhatHappened = whatHappened?.trim();

    const [record] = Objects.search()
      .patientRecord()
      .filter(r => r.recordId.exactMatch(trimmedRecordId))
      .all();

    if (!record) {
      console.log(`No Patient found with ID ${trimmedRecordId}. Nothing to update.`);
      return;
    }

    const [patient] = Objects.search()
      .patient()
      .filter(p => p.patientId.exactMatch(record.patientId ?? ""))
      .all();

    if (trimmedSymptoms) record.symptoms = trimmedSymptoms;
    if (trimmedTests) record.tests = trimmedTests;
    if (trimmedHistory) record.history = trimmedHistory;
    if (trimmedDiagnosis) record.diagnosis = trimmedDiagnosis;
    if (trimmedTreatment) record.treatment = trimmedTreatment;
    if (trimmedResult) record.result = trimmedResult;
    if (trimmedWhatHappened) record.whatHappened = trimmedWhatHappened;
    if (trimmedMedications) patient.medications = trimmedMedications;

    console.log(`Record updated for Patient ${trimmedRecordId}.`);
  }

  @OntologyEditFunction()
  @Edits(PatientRecord)
  public completeAppointment(recordId: string): void {
    const trimmedRecordId = recordId?.trim();

    const [record] = Objects.search()
      .patientRecord()
      .filter(r => r.recordId.exactMatch(trimmedRecordId))
      .all();

    if (!record) {
      console.log(`No record found with ID ${trimmedRecordId}. Nothing to update.`);
      return;
    }

    record.complete = true;
    console.log(`Appointment marked as complete for Patient ${trimmedRecordId}.`);
  }

  @OntologyEditFunction()
  @Edits(PatientRecord)
  public updateTimesSeen(recordId: string): void {
    const trimmedRecordId = recordId?.trim();

    const [record] = Objects.search()
      .patientRecord()
      .filter(r => r.recordId.exactMatch(trimmedRecordId))
      .all();

    if (!record) {
      console.log(`No record found with ID ${trimmedRecordId}. Nothing to update.`);
      return;
    }

    record.timesSeenInVisit = (record.timesSeenInVisit ?? 0) + 1;
    record.isWithDoctor = false;
  }
}
