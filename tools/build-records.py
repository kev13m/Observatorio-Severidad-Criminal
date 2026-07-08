import csv
import json
import re
from pathlib import Path
from urllib.request import urlopen, Request


SOURCE_URL = "https://estadisticasdecriminalidad.ses.mir.es/sec/jaxiPx/files/_px/es/csv_bd/Datos1/l0/01001.csv_bd"

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "data" / "records.json"

START_YEAR = 2016
END_YEAR = 2024


WEIGHTS = {
    "Homicidios consumados": 800,
    "Tentativas de homicidio/asesinato": 200,
    "Agresión sexual con penetración": 150,
    "Corrupción de menores/incapacitados": 120,
    "Agresión sexual": 60,
    "Pornografía de menores": 60,
    "Robos con violencia/intimidación": 20,
    "Malos tratos habituales ámbito familiar": 20,
    "Tráfico de drogas": 20,
    "Lesiones": 8,
    "Hurtos": 1
}


CATEGORY_MAP = {
    "1.1.1.-Homicidios dolosos/asesinatos consumados": "Homicidios consumados",
    "1.2.-Lesiones": "Lesiones",
    "2.1.-Malos tratos habituales en el ámbito familiar": "Malos tratos habituales ámbito familiar",
    "3.1.-Agresión sexual": "Agresión sexual",
    "3.2.-Agresión sexual con penetración": "Agresión sexual con penetración",
    "3.3.-Corrupción de menores o incapacitados": "Corrupción de menores/incapacitados",
    "3.4.-Pornografía de menores": "Pornografía de menores",
    "5.1.-Hurtos": "Hurtos",
    "5.3.-Robos con violencia o intimidación": "Robos con violencia/intimidación",
    "6.1.-Tráfico de drogas": "Tráfico de drogas"
}


HOMICIDE_TOTAL_CATEGORY = "1.1.-Homicidios dolosos/asesinatos"
HOMICIDE_CONSUMED_CATEGORY = "1.1.1.-Homicidios dolosos/asesinatos consumados"


EXCLUDED_TERRITORIES = {
    "TOTAL NACIONAL",
    "EN EL EXTRANJERO",
    "DESCONOCIDA"
}


def download_source_text(url):
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0"
        }
    )

    with urlopen(request) as response:
        raw = response.read()

    for encoding in ["utf-8-sig", "latin-1"]:
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue

    raise RuntimeError("No se pudo decodificar el archivo oficial.")


def detect_delimiter(text):
    first_line = text.splitlines()[0]

    candidates = [";", ",", "\t"]
    scores = {
        delimiter: first_line.count(delimiter)
        for delimiter in candidates
    }

    return max(scores, key=scores.get)


def parse_csv(text):
    delimiter = detect_delimiter(text)
    rows = list(csv.DictReader(text.splitlines(), delimiter=delimiter))

    if not rows:
        raise RuntimeError("El CSV oficial no contiene filas.")

    return rows


def clean_number(value):
    if value is None:
        return 0

    value = str(value).strip()

    if value == "":
        return 0

    value = value.replace(".", "")
    value = value.replace(",", ".")

    try:
        return int(float(value))
    except ValueError:
        return 0


def normalize_key(name):
    return re.sub(r"\s+", " ", str(name).strip())


def resolve_columns(row):
    available = {
        normalize_key(key): key
        for key in row.keys()
    }

    candidates = {
        "territory": [
            "Comunidades autónomas",
            "Comunidades Autónomas",
            "Comunidades y Ciudades Autónomas"
        ],
        "crime": [
            "Tipología penal",
            "Tipologia penal"
        ],
        "year": [
            "periodo",
            "Periodo",
            "Año"
        ],
        "count": [
            "Total",
            "total"
        ]
    }

    resolved = {}

    for target, options in candidates.items():
        for option in options:
            if option in available:
                resolved[target] = available[option]
                break

    missing = set(candidates.keys()) - set(resolved.keys())

    if missing:
        raise RuntimeError(
            "No se pudieron resolver columnas. "
            f"Faltan: {missing}. "
            f"Columnas disponibles: {list(row.keys())}"
        )

    return resolved


def build_lookup(rows, columns):
    lookup = {}

    for row in rows:
        territory = row[columns["territory"]].strip()
        crime_raw = row[columns["crime"]].strip()
        year = clean_number(row[columns["year"]])
        count = clean_number(row[columns["count"]])

        if territory in EXCLUDED_TERRITORIES:
            continue

        if year < START_YEAR or year > END_YEAR:
            continue

        lookup[(territory, crime_raw, year)] = count

    return lookup


def build_records(rows):
    columns = resolve_columns(rows[0])
    lookup = build_lookup(rows, columns)

    territories = sorted({
        territory
        for territory, _, _ in lookup.keys()
    })

    years = list(range(START_YEAR, END_YEAR + 1))
    records = []

    for territory in territories:
        for year in years:
            for raw_category, clean_category in CATEGORY_MAP.items():
                count = lookup.get((territory, raw_category, year), 0)
                weight = WEIGHTS[clean_category]

                records.append({
                    "territory": territory,
                    "year": year,
                    "crime": clean_category,
                    "count": count,
                    "weight": weight,
                    "weighted_score": count * weight
                })

            homicide_total = lookup.get((territory, HOMICIDE_TOTAL_CATEGORY, year), 0)
            homicide_consumed = lookup.get((territory, HOMICIDE_CONSUMED_CATEGORY, year), 0)
            attempts = max(homicide_total - homicide_consumed, 0)

            records.append({
                "territory": territory,
                "year": year,
                "crime": "Tentativas de homicidio/asesinato",
                "count": attempts,
                "weight": WEIGHTS["Tentativas de homicidio/asesinato"],
                "weighted_score": attempts * WEIGHTS["Tentativas de homicidio/asesinato"]
            })

    records.sort(key=lambda item: (item["territory"], item["crime"], item["year"]))

    return records


def main():
    print("Descargando datos oficiales...")
    text = download_source_text(SOURCE_URL)

    print("Parseando CSV...")
    rows = parse_csv(text)

    print("Construyendo records.json...")
    records = build_records(rows)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    territories = sorted(set(record["territory"] for record in records))
    crimes = sorted(set(record["crime"] for record in records))

    print("")
    print("Proceso terminado.")
    print(f"Archivo generado: {OUTPUT_PATH}")
    print(f"Territorios incluidos: {len(territories)}")
    print(f"Categorías incluidas: {len(crimes)}")
    print(f"Registros generados: {len(records)}")
    print("")
    print("Territorios:")
    for territory in territories:
        print(f" - {territory}")


if __name__ == "__main__":
    main()