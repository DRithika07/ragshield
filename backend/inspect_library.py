import sys
sys.path.insert(0, ".")
from app.dependencies import get_chroma_service

chroma = get_chroma_service()
col = chroma._collections["threat_library"]
all_data = col.get(include=["documents", "metadatas"])

print(f"Total entries: {len(all_data['ids'])}")
print()

for id_, doc in list(zip(all_data["ids"], all_data["documents"]))[:20]:
    print(f"ID: {id_} | {repr(doc[:120])}")
