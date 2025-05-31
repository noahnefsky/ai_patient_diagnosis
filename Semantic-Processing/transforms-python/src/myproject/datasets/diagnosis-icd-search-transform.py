import numpy as np
import pandas as pd
from pyspark.sql.functions import pandas_udf, split, trim, col
from pyspark.sql.types import StringType, FloatType, StructType, StructField
from transforms.api import transform, TransformContext, Input, TransformInput, Output, TransformOutput


@transform(
    icd_10_codes=Input("ri.foundry.main.dataset.4df7a321-baad-4d03-b93b-561d4626c801"),
    pmc_patient_with_embedded_diagnosis=Input("ri.foundry.main.dataset.80919132-9774-44f5-8af2-622291a4eede"),
    pmc_patient_diagnosis_icd=Output("/noahnefsky-655130/build_now/PMC_Patient_Diagnosis_ICD")
)
def compute(
    ctx: TransformContext,
    icd_10_codes: TransformInput,
    pmc_patient_with_embedded_diagnosis: TransformInput,
    pmc_patient_diagnosis_icd: TransformOutput
):
    spark = ctx.spark_session

    # Load ICD code data and collect embeddings
    icd_df = icd_10_codes.dataframe().select("icd_10_code", "embedded_description", "description")
    icd_list = icd_df.limit(1000).collect()
    # icd_list = icd_df.collect()  # Safe if it's small
    icd_embeddings = [
        (
            row["icd_10_code"],
            np.array(
                [float(x) for x in row["embedded_description"].strip("[]").split(",")],
                dtype=np.float32
            ),
            row["description"]
        )
        for row in icd_list
    ]
    broadcast_icds = spark.sparkContext.broadcast(icd_embeddings)

    # Define the schema for the UDF output: 4 columns.
    schema = StructType([
        StructField("icd_10_code", StringType()),
        StructField("embedded_description", StringType()),
        StructField("description", StringType()),
        StructField("score", FloatType())
    ])

    # Define a Pandas UDF that returns a DataFrame with four columns.
    @pandas_udf(schema)
    def find_best_icd(embedded_diagnosis_series: pd.Series) -> pd.DataFrame:
        results = []
        icds = broadcast_icds.value

        for emb in embedded_diagnosis_series:
            diag_vec = np.array(emb, dtype=np.float32)
            best_score = -1.0
            best_code = None
            best_vec = None
            best_desc = None

            for code, icd_vec, description in icds:
                # Compute cosine similarity.
                sim = np.dot(diag_vec, icd_vec) / (np.linalg.norm(diag_vec) * np.linalg.norm(icd_vec))
                if sim > best_score:
                    best_score = sim
                    best_code = code
                    best_vec = icd_vec
                    best_desc = description
            # Convert the numpy vector to a string representation.
            best_vec_str = str(best_vec.tolist()) if best_vec is not None else ""
            results.append((best_code, best_vec_str, best_desc, float(best_score)))
        return pd.DataFrame(results, columns=["icd_10_code", "embedded_description", "description", "score"])

    # Load diagnosis data and compute best match.
    patient_df = pmc_patient_with_embedded_diagnosis.dataframe()
    df_with_symptoms = patient_df.withColumn(
        "symptoms",
        split(trim(col("symptoms")), r",\s*").cast("array<string>")
    )
    result_df = df_with_symptoms.withColumn("icd_result", find_best_icd("embedded_diagnosis"))
    # Expand the struct column into separate columns.
    result_df = result_df.select("*", "icd_result.*").drop("icd_result")

    # Write result
    pmc_patient_diagnosis_icd.write_dataframe(result_df)
