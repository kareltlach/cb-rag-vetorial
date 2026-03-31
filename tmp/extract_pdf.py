from pypdf import PdfReader
import os

pdf_path = r"d:\Antigravity\1-Projetos\cb-rag-vetorial\data\docs\Playbook_Prompts_Essenciais.pdf"
output_path = r"d:\Antigravity\1-Projetos\cb-rag-vetorial\tmp\extracted_text.txt"

if os.path.exists(pdf_path):
    reader = PdfReader(pdf_path)
    with open(output_path, "w", encoding="utf-8") as f:
        for i, page in enumerate(reader.pages):
            f.write(f"--- PAGE {i+1} ---\n")
            f.write(page.extract_text() + "\n")
    print("Extraction complete")
else:
    print("File not found")
