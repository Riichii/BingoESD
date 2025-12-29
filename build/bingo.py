import random
import pyttsx3
import threading
import queue
import cv2
from PIL import Image, ImageTk
from pathlib import Path
from tkinter import Tk, Canvas, Button, PhotoImage, Scale, HORIZONTAL

OUTPUT_PATH = Path(__file__).parent
ASSETS_PATH = OUTPUT_PATH / Path("assets")

def relative_to_assets(path: str) -> Path:
    return ASSETS_PATH / Path(path)

class BingoGame:
    def __init__(self, window):
        self.window = window
        self.window.geometry("1600x900")
        self.window.configure(bg="#FFFFFF")
        self.window.title("Bingo ESD")

        self.canvas = Canvas(
            window, bg="#FFFFFF", height=900, width=1600, bd=0,
            highlightthickness=0, relief="ridge"
        )
        self.canvas.place(x=0, y=0)
        
        video_path = relative_to_assets("fondo.mp4")
        self.cap = cv2.VideoCapture(str(video_path))
        self.video_item = self.canvas.create_image(800.0, 450.0)
        self.update_video()
        
        self.image_logo = PhotoImage(file=relative_to_assets("logo.png"))
        self.canvas.create_image(1297.0,120.0,image=self.image_logo)
        self.called_numbers = []
        self.buttons = {}
        self.history_buttons = []
        
        self.last_number_button = Button(
            window, text=" ", font=("Montserrat", 100, "bold"), fg="black", bg="lightgray", relief="raised"
        )
        self.last_number_button.place(x=1153, y=215, width=274, height=274)
        
        self.speaker_queue = queue.Queue()
        self.speaker_thread = threading.Thread(target=self.process_speaker_queue, daemon=True)
        self.speaker_thread.start()
        
        self.create_buttons()
        self.create_history_buttons()
    
    def update_video(self):
        ret, frame = self.cap.read()
        if not ret:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = self.cap.read()
            if not ret: return 

        # Convertir BGR (OpenCV) a RGB (PIL)
        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(frame)
        
        # --- ELIMINAR MARCA DE AGUA Y ESCALAR ---
        # 1. Recorte (opcional): Si la marca de agua está abajo, recortamos un 5% del fondo
        width, height = image.size
        # Recortamos por ejemplo los últimos 40 píxeles si hay marca de agua abajo
        # image = image.crop((0, 0, width, height - 40)) 
        
        # 2. Re-escalado al tamaño de la ventana (1600x900)
        image = image.resize((1600, 900), Image.Resampling.LANCZOS)
        
        self.photo = ImageTk.PhotoImage(image=image)
        self.canvas.itemconfig(self.video_item, image=self.photo)
        self.window.after(33, self.update_video) 
        
    def create_buttons(self):
        spacing = 85
        for i in range(1, 91):
            btn = Button(
                text=str(i), font=("Montserrat", 38, "bold"), width=4, height=2,
                borderwidth=1, relief="raised", bg="lightgray", fg="gray",
                command=lambda n=i: self.toggle_number(n)
            )
            self.buttons[i] = btn
            x_pos = 20 + ((i - 1) % 10) * spacing
            y_pos = 100 + ((i - 1) // 10) * spacing
            btn.place(x=x_pos, y=y_pos, width=80, height=80)
        
        self.draw_main_buttons()
    
    def toggle_number(self, n):
        # Si el número no estaba en la lista de llamados, lo marcamos (manual)
        if n not in self.called_numbers:
            self.called_numbers.append(n)
            self.mark_number(n)
            # Sincronizamos con el resto de sistemas
            self.update_history()
            self.speaker_queue.put(n)
            self.last_number_button.config(text=str(n))
        else:
            # Si ya estaba, lo desmarcamos (DESHACER)
            is_showing = (self.last_number_button.cget("text") == str(n))
            self.called_numbers.remove(n)
            self.buttons[n].config(bg="lightgray", fg="gray")
                
            # 1. Actualizar visor: si el número quitado era el que se veía, ponemos el nuevo último
            if is_showing:
                prev_text = str(self.called_numbers[-1]) if self.called_numbers else ""
                self.last_number_button.config(text=prev_text)
            
            # 2. Actualizar historial
            self.update_history()

    def draw_main_buttons(self):
        draw_number_img = PhotoImage(file=relative_to_assets("boton_sacar_numero.png"))
        draw_button = Button(
            image=draw_number_img, borderwidth=0, highlightthickness=0, relief="flat", command=self.draw_number
        )
        draw_button.image = draw_number_img
        draw_button.place(x=1202, y=525, width=176, height=80)
        
        reset_img = PhotoImage(file=relative_to_assets("boton_reiniciar.png"))
        reset_button = Button(
            image=reset_img, borderwidth=0, highlightthickness=0, relief="flat", command=self.reset_game
        )
        reset_button.image = reset_img
        reset_button.place(x=1400, y=801, width=175, height=78)


        self.draw_custom_slider()

    def draw_custom_slider(self):
        # Dibujar elementos del slider directamente en el canvas
        # Posición base
        x, y = 1150, 840
        self.slider_width = 200
        
        # Fondo de la barra (línea fina)
        self.canvas.create_text(x + 100, y - 25, text="VOLUMEN", font=("Montserrat", 12, "bold"), fill="white", tags="slider_ui")
        self.canvas.create_line(x, y, x + self.slider_width, y, fill="#444444", width=4, tags="slider_ui")
        
        # Mando (círculo)
        # Calculamos X según volumen actual (0.5 por defecto)
        self.slider_val = 0.5
        knob_x = x + (self.slider_val * self.slider_width)
        self.slider_knob = self.canvas.create_oval(knob_x - 10, y - 10, knob_x + 10, y + 10, fill="white", outline="white", tags="slider_knob")
        
        self.canvas.tag_bind("slider_knob", "<B1-Motion>", self.move_slider)
        self.canvas.tag_bind("slider_ui", "<Button-1>", self.click_slider)
        
    def move_slider(self, event):
        x_base = 1150
        new_x = event.x
        if new_x < x_base: new_x = x_base
        if new_x > x_base + self.slider_width: new_x = x_base + self.slider_width
        
        # Actualizar gráfico
        y = 840
        self.canvas.coords(self.slider_knob, new_x - 10, y - 10, new_x + 10, y + 10)
        
        val = (new_x - x_base) / self.slider_width
        self.apply_volume(val)

    def click_slider(self, event):
        self.move_slider(event)

    def apply_volume(self, val):
        try:
            import pygame
            if not pygame.mixer.get_init():
                pygame.mixer.init()
            pygame.mixer.music.set_volume(val)
        except:
            pass
    
    def create_history_buttons(self):
        positions = [(1054, 641), (1152, 641), (1250, 641), (1348, 641), (1446, 641)]  
        for x, y in positions:
            btn = Button(
                self.window, text=" ", font=("Montserrat", 38, "bold"), fg="black", bg="lightgray", relief="raised"
            )
            btn.place(x=x, y=y, width=80, height=80)
            self.history_buttons.append(btn)
    
    def update_history(self):
        # Limpiar todos los botones primero
        for btn in self.history_buttons:
            btn.config(text=" ")
            
        # Rellenar con los anteriores al último
        if len(self.called_numbers) > 1:
            for i in range(min(len(self.history_buttons), len(self.called_numbers) - 1)):
                self.history_buttons[i].config(text=str(self.called_numbers[-(i+2)]))
    
    def draw_number(self):
        available_numbers = [n for n in range(1, 91) if n not in self.called_numbers]
        if available_numbers:
            new_number = random.choice(available_numbers)
            self.called_numbers.append(new_number)
            self.last_number_button.config(text=str(new_number))
            self.mark_number(new_number)
            self.update_history()
            self.speaker_queue.put(new_number)
    
    def mark_number(self, number):
        if number in self.buttons:
            self.buttons[number].config(bg="lightgreen", fg="black")
    
    def process_speaker_queue(self):
        import pygame
        import os
        from pathlib import Path

        # Inicializar mixer de pygame para reproducir audio
        pygame.mixer.init()
        
        # Ruta donde están las voces descargadas
        VOICES_DIR = OUTPUT_PATH / "assets" / "voces"

        while True:
            data = self.speaker_queue.get()
            try:
                # VERIFICACIÓN CRÍTICA: ¿Sigue el número en el tablero?
                # Si el usuario lo ha desmarcado mientras estaba en la cola, NO hablamos.
                if data in self.called_numbers:
                    audio_file = VOICES_DIR / f"{data}.mp3"
                    
                    if audio_file.exists():
                        pygame.mixer.music.load(str(audio_file))
                        pygame.mixer.music.play()
                        while pygame.mixer.music.get_busy():
                            # Re-verificar durante la reproducción por si se desmarca "a mitad"
                            if data not in self.called_numbers:
                                pygame.mixer.music.stop()
                                break
                            pygame.time.Clock().tick(10)
                        pygame.mixer.music.unload()
            except Exception as e:
                print(f"Error voz: {e}")
            finally:
                self.speaker_queue.task_done()
    
    def reset_game(self):
        try:
            import pygame
            if pygame.mixer.get_init():
                pygame.mixer.music.stop()
        except:
            pass
        self.called_numbers.clear()
        self.last_number_button.config(text="")
        for btn in self.buttons.values():
            btn.config(bg="lightgray", fg="gray")
        for btn in self.history_buttons:
            btn.config(text=" ")

if __name__ == "__main__":
    root = Tk()
    game = BingoGame(root)
    root.resizable(False, False)
    root.mainloop()
