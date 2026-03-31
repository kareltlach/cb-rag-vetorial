import os
import sys

try:
    from pinecone import Pinecone
    print("Pinecone imported, version 4.0.0 or higher likely.")
except Exception as e:
    print(f"Error importing Pinecone: {e}")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
    api_key = os.environ.get("PINECONE_API_KEY")
    if not api_key:
        print("PINECONE_API_KEY not found in environment.")
        sys.exit(1)
    pc = Pinecone(api_key=api_key)
    print("Pinecone initialized.")
    indexes = pc.list_indexes()
    print(f"Found {len(indexes)} indexes.")
except Exception as e:
    print(f"Error during Pinecone initialization or list_indexes: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
