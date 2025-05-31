# ai_patient_diagnosis
In the ER, doctors make critical decisions, often without specialist support, while long wait times put patients with serious but less obvious symptoms at risk. I built an application using existing datasets to improve triage prioritization and diagnostic accuracy, leading to better patient outcomes. I used Palantir Foundry to create the frontend and organize the data pipeline.

## Demo Link
https://www.loom.com/share/98ccb003beda461195ec8fcfe9bbb045?sid=68ab0305-6703-4944-9525-8ec1d46bc45c

## Dataset Used
https://arxiv.org/pdf/2202.13876

We used a cleaned and structured version of the PMC_patient dataset, which contains rich, unstructured clinical notes from real-world patient encounters. To standardize diagnoses and enable semantic reasoning, we also used the ICD (International Classification of Diseases) dataset as a universal diagnostic framework. This provided descriptions and codes for thousands of known conditions, forming the backbone for diagnosis matching and search.

## Data Pipeline
The data pipeline was implemented in Palantir Foundry, allowing scalable, version-controlled transformation and enrichment.
<img width="800" alt="Pipeline" src="https://github.com/user-attachments/assets/5de18f4a-0310-4fdb-9690-a1d9b26886b2" />

<b>Step 1</b>: Entity Extraction
Used LLM-based entity extraction to parse patient notes into structured visit records, each with symptoms, diagnosis, test results, history, and outcomes.

<b>Step 2</b>: Diagnosis Standardization via Semantic Search
Embedded each diagnosis and matched it to the closest ICD description using cosine similarity of embedding vectors, linking patient data to a standardized diagnostic vocabulary.

<b>Step 3</b>: Cleaning and Filtering
Removed records with low similarity scores, missing fields, or ambiguous mappings. Aggregated symptoms and history for use in downstream models.

<b>Step 4</b>: Embedding and Semantic Indexing
Embedded symptoms and historical context to allow real-time semantic search for similar cases and suggested diagnoses.

## Applications
- Built in Palantir Foundry

🏥 <b>Patient Intake Application</b>
Used by either the patient or intake staff
Inputs: Health card ID, demographic info, symptoms, medication, history
Output: Submits intake and adds patient to the priority queue based on symptom severity

🧑‍⚕️ <b>Doctor Portal</b>
Doctors select patients from a real-time triage queue
View previous visit history, current symptoms, and suggested diagnoses/tests
Make edits, add treatments, and discharge or retain for follow-up

## How the AI assistant works
<img width="800" alt="Screen Shot 2025-05-31 at 3 02 16 PM" src="https://github.com/user-attachments/assets/97475e5a-8685-4017-8f3c-3c77f747898a" />

The AI assistant augments emergency room decision-making by processing patient inputs and surfacing high-quality diagnostic suggestions and test recommendations in real time.

🔍 <b>Step 1: Semantic Search for Candidate Diagnoses</b>
The assistant takes in the patient’s intake form, which includes symptoms, history, and medications.

All symptoms are lowercased, sorted, and normalized for length to ensure consistent matching.

Using embedding-based semantic search, the assistant scans each row in the cleaned ICD-linked diagnosis dataset to retrieve the top 5 most semantically similar diagnoses along with associated tests.

🧠 <b>Step 2: LLM-Powered Reasoning</b>
The 5 candidate diagnoses and patient context are passed to a large language model (LLM).

The LLM validates the logic behind the semantic matches, filters out false positives, and optionally ranks diagnoses by relevance.

It also proposes a list of recommended diagnostic tests and provides reasoning for each suggestion.

## Impact
This system aims to dramatically improve ER outcomes by:

<b>Reducing Mortality Due to Wait Times</b>

Automatically prioritizing patients based on symptom severity ensures those who need help most are seen first.


<b>Assisting Doctors with Diagnostic Decision-Making</b>

In high-stress, under-staffed ERs, doctors often lack access to specialists. The AI assistant offers diagnostic suggestions and test recommendations, increasing accuracy and speed.


<b>Structuring Patient History for Better Decisions</b>

Instead of long, messy notes, doctors see a structured summary of past visits, preconditions, and treatments—making it easier to understand context and take action.

