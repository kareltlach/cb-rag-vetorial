import os

base_dir = r"d:\Antigravity\1-Projetos\cb-rag-vetorial\data"
if os.path.exists(base_dir):
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            print(os.path.join(root, file))
else:
    print(f"Folder '{base_dir}' not found")
