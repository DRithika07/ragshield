import sys
sys.path.insert(0, '.')

from sentence_transformers import SentenceTransformer
from app.dependencies import get_chroma_service

model = SentenceTransformer('all-MiniLM-L6-v2')
chroma = get_chroma_service()

text = 'The capital of France is Paris. It is known for the Eiffel Tower and rich culture.'
emb = model.encode(text).tolist()

results = chroma.query_threat_library(emb, top_k=3)

print('Top 3 matches:')
for r in results:
    sim = r.get('similarity') or r.get('score') or 0
    doc = r.get('document') or r.get('content') or str(r)
    print(f'Score: {sim:.3f} | {str(doc)[:100]}')
