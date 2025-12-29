import asyncio
import edge_tts
import os
from pathlib import Path

# Configuración
VOICE = "es-ES-ElviraNeural"
OUTPUT_DIR = Path("c:/Users/otrog/Downloads/BingoPrueba/build/assets/voces")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

async def generate_voice(text, filename):
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(OUTPUT_DIR / filename)
    print(f"Generado: {filename}")

async def main():
    tasks = []
    for i in range(1, 91):
        filename = f"{i}.mp3"
        
        # Lógica de texto: si tiene 2 cifras, las separamos
        texto_a_decir = str(i)
        if i >= 10:
            cifras = list(str(i))

            texto_a_decir = f"{i},............... {cifras[0]}, {cifras[1]}"
        else:
            texto_a_decir = f"{i},............... {i}"
            
        task = generate_voice(texto_a_decir, filename)
        tasks.append(task)
    
    await asyncio.gather(*tasks)
    print("¡Todas las voces generadas!")

if __name__ == "__main__":
    asyncio.run(main())
