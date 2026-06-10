import pygame
import sys
import random
import os
import math

# Initialize Pygame
pygame.init()
pygame.mixer.init()

# Game Constants
WIDTH, HEIGHT = 600, 700
GRID_SIZE = 50
COLS = WIDTH // GRID_SIZE
ROWS = HEIGHT // GRID_SIZE
FPS = 60

# Palette Colors (Anime arcade theme)
BG_DARK = (15, 12, 27)
ROAD_COLOR = (20, 17, 36)
SAFE_COLOR = (34, 26, 54)
PRIMARY = (255, 42, 116)
SECONDARY = (5, 217, 232)
YELLOW = (245, 238, 48)
WHITE = (255, 255, 255)
TEXT_MUTED = (139, 139, 184)

# Create Screen Window
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Koko-chan: Tokyo Crossing (Rooster Fighter Edition)")
clock = pygame.time.Clock()

# Load Assets
def load_image(path, size=None):
    if os.path.exists(path):
        try:
            img = pygame.image.load(path).convert_alpha()
            if size:
                img = pygame.transform.scale(img, size)
            return img
        except Exception as e:
            print(f"Error loading {path}: {e}")
    return None

# Load chicken & car sprites
chicken_sprite = load_image('assets/chicken.png', (44, 44))
car_sprite = load_image('assets/car.png', (60, 36))

# Sound synthesis using pygame.mixer.Sound (array-based beep generation)
def generate_beep_sound(freq_start, freq_end, duration_ms, volume=0.1):
    try:
        sample_rate = 44100
        n_samples = int(sample_rate * (duration_ms / 1000.0))
        buf = bytearray()
        
        for i in range(n_samples):
            t = float(i) / sample_rate
            # Frequency sweep
            freq = freq_start + (freq_end - freq_start) * (float(i) / n_samples)
            val = int(32767 * math.sin(2.0 * math.pi * freq * t) * volume)
            buf.extend(val.to_bytes(2, byteorder='little', signed=True))
            
        return pygame.mixer.Sound(buffer=buf)
    except Exception as e:
        print(f"Could not synthesize sound: {e}")
        return None

# Pre-synthesize game sounds
jump_sound = generate_beep_sound(150, 800, 150, 0.15)
crash_sound = generate_beep_sound(300, 40, 400, 0.25)
score_sound = generate_beep_sound(523, 783, 300, 0.15)
gameover_sound = generate_beep_sound(440, 110, 800, 0.2)

def play_sound(sound):
    if sound:
        sound.play()

# Particle Class
class Particle:
    def __init__(self, x, y, color, p_type):
        self.x = x
        self.y = y
        self.color = color
        self.type = p_type
        
        self.vx = random.uniform(-3, 3) if p_type == 'spark' else random.uniform(-1, 1)
        self.vy = random.uniform(-3, 3) if p_type == 'spark' else random.uniform(-1, 1)
        
        if p_type == 'sakura':
            self.vx = random.uniform(-1.5, -0.5)
            self.vy = random.uniform(1.0, 2.0)
            
        self.size = random.uniform(2, 8)
        self.alpha = 255
        self.decay = random.uniform(3, 8) # Alpha reduction per frame

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.alpha = max(0, self.alpha - self.decay)

    def draw(self, surface):
        if self.alpha <= 0:
            return
        
        # Draw transparent particles
        s = pygame.Surface((int(self.size * 2), int(self.size * 2)), pygame.SRCALPHA)
        
        if self.type == 'sakura':
            # Pink cherry blossom shape
            color = (255, 183, 197, int(self.alpha))
            pygame.draw.ellipse(s, color, (0, 0, int(self.size), int(self.size * 1.5)))
        elif self.type == 'feather':
            # White feathers
            color = (255, 255, 255, int(self.alpha))
            pygame.draw.ellipse(s, color, (0, 0, int(self.size * 1.5), int(self.size)))
        else:
            # Sparks
            color = (self.color[0], self.color[1], self.color[2], int(self.alpha))
            pygame.draw.rect(s, color, (0, 0, int(self.size), int(self.size)))
            
        surface.blit(s, (int(self.x - self.size), int(self.y - self.size)))

# Player Class
class Player:
    def __init__(self):
        self.reset()
        self.width = 44;
        self.height = 44;

    def reset(self):
        self.grid_x = COLS // 2
        self.grid_y = ROWS - 1
        self.x = self.grid_x * GRID_SIZE + (GRID_SIZE - 44) // 2
        self.y = self.grid_y * GRID_SIZE + (GRID_SIZE - 44) // 2
        self.target_x = self.x
        self.target_y = self.y
        self.facing = 'up' # 'up', 'down', 'left', 'right'

    def move(self, dx, dy, direction):
        next_grid_x = self.grid_x + dx
        next_grid_y = self.grid_y + dy
        self.facing = direction

        if 0 <= next_grid_x < COLS and 0 <= next_grid_y < ROWS:
            self.grid_x = next_grid_x
            self.grid_y = next_grid_y
            self.target_x = self.grid_x * GRID_SIZE + (GRID_SIZE - 44) // 2
            self.target_y = self.grid_y * GRID_SIZE + (GRID_SIZE - 44) // 2
            play_sound(jump_sound)
            return True
        return False

    def update(self):
        # Lerp position
        self.x += (self.target_x - self.x) * 0.25
        self.y += (self.target_y - self.y) * 0.25

    def draw(self, surface):
        if chicken_sprite:
            # Draw Keiji sprite
            img = chicken_sprite
            if self.facing == 'left':
                img = pygame.transform.flip(img, True, False)
            elif self.facing == 'down':
                img = pygame.transform.rotate(img, 180)
            elif self.facing == 'right':
                img = pygame.transform.flip(img, False, False) # standard
                
            surface.blit(img, (int(self.x), int(self.y)))
        else:
            # Fallback drawing (Rooster fighter red comb & white body)
            pygame.draw.circle(surface, WHITE, (int(self.x + 22), int(self.y + 22)), 18)
            pygame.draw.circle(surface, PRIMARY, (int(self.x + 22), int(self.y + 10)), 8) # Comb

# Obstacle Class
class Obstacle:
    def __init__(self, row, speed, o_type):
        self.row = row
        self.speed = speed
        self.type = o_type
        self.width = 90 if o_type == 'truck' else (35 if o_type == 'scooter' else 60)
        self.height = 36
        self.y = self.row * GRID_SIZE + (GRID_SIZE - self.height) // 2
        
        # Hue coloring offset
        self.color = (random.randint(100, 255), random.randint(50, 200), random.randint(50, 255))

        if self.speed > 0:
            self.x = -self.width - 10
        else:
            self.x = WIDTH + 10

    def update(self):
        self.x += self.speed

    def draw(self, surface):
        if car_sprite:
            img = car_sprite
            # Scale dynamically based on vehicle type
            if self.type == 'truck':
                img = pygame.transform.scale(car_sprite, (90, 36))
            elif self.type == 'scooter':
                img = pygame.transform.scale(car_sprite, (35, 36))
            else:
                img = pygame.transform.scale(car_sprite, (60, 36))

            if self.speed < 0:
                img = pygame.transform.flip(img, True, False)
            surface.blit(img, (int(self.x), int(self.y)))
        else:
            # Fallback colored rectangles
            pygame.draw.rect(surface, self.color, (int(self.x), int(self.y), self.width, self.height), border_radius=8)

    def is_offscreen(self):
        if self.speed > 0 and self.x > WIDTH + 50:
            return True
        if self.speed < 0 and self.x < -self.width - 50:
            return True
        return False

    def get_rect(self):
        return pygame.Rect(self.x + 4, self.y + 4, self.width - 8, self.height - 8)


# Lane Definitions
LANES = [
    {"row": 1, "speed": -2.0, "rate": 0.015, "type": "car"},
    {"row": 2, "speed": 1.5,  "rate": 0.010, "type": "truck"},
    {"row": 3, "speed": -1.2, "rate": 0.018, "type": "scooter"},
    {"row": 4, "speed": 2.8,  "rate": 0.008, "type": "car"},
    {"row": 5, "speed": 0,    "rate": 0,     "type": "safe"},
    {"row": 6, "speed": -1.8, "rate": 0.014, "type": "car"},
    {"row": 7, "speed": 1.2,  "rate": 0.012, "type": "truck"},
    {"row": 8, "speed": -1.5, "rate": 0.015, "type": "car"},
    {"row": 9, "speed": 2.2,  "rate": 0.011, "type": "scooter"},
    {"row": 10, "speed": 0,   "rate": 0,     "type": "safe"},
    {"row": 11, "speed": -2.5, "rate": 0.009, "type": "car"},
    {"row": 12, "speed": 1.8,  "rate": 0.013, "type": "car"}
]

def get_lane_type(row):
    if row == 0 or row == 5 or row == 10 or row == ROWS - 1:
        return 'safe'
    return 'road'

# Game Loop variables
player = Player()
obstacles = []
particles = []
score = 0
high_score = 0
lives = 3
game_state = 'START' # 'START', 'PLAYING', 'GAMEOVER'
shake_intensity = 0

# Load high score from file if exists
if os.path.exists('highscore.txt'):
    try:
        with open('highscore.txt', 'r') as f:
            high_score = int(f.read().strip())
    except:
        pass

def save_high_score():
    try:
        with open('highscore.txt', 'w') as f:
            f.write(str(high_score))
    except:
        pass

# Fonts setup
try:
    font_large = pygame.font.SysFont("Outfit", 42, bold=True)
    font_medium = pygame.font.SysFont("Fredoka", 24, bold=True)
    font_pixel = pygame.font.SysFont("Courier", 16, bold=True)
except:
    font_large = pygame.font.Font(None, 48)
    font_medium = pygame.font.Font(None, 28)
    font_pixel = pygame.font.Font(None, 20)


def draw_background():
    screen.fill(BG_DARK)
    
    # Draw lanes
    for r in range(ROWS):
        y = r * GRID_SIZE
        lane_type = get_lane_type(r)
        
        if lane_type == 'safe':
            pygame.draw.rect(screen, SAFE_COLOR, (0, y, WIDTH, GRID_SIZE))
            # Draw dividers
            pygame.draw.rect(screen, SECONDARY, (0, y, WIDTH, 2))
            pygame.draw.rect(screen, SECONDARY, (0, y + GRID_SIZE - 2, WIDTH, 2))
            
            # Sakura blossom details
            for col in range(COLS):
                if (col + r) % 4 == 0:
                    txt = font_medium.render("🌸", True, (255,183,197))
                    screen.blit(txt, (col * GRID_SIZE + 15, y + 15))
        else:
            pygame.draw.rect(screen, ROAD_COLOR, (0, y, WIDTH, GRID_SIZE))
            
            # Draw dash divider line
            if r < ROWS - 1 and get_lane_type(r + 1) != 'safe':
                # Custom dash drawing
                for dx in range(0, WIDTH, 30):
                    pygame.draw.line(screen, (50, 45, 75), (dx, y + GRID_SIZE), (dx + 15, y + GRID_SIZE), 2)
                    
            # Warning line on safe boundary
            if get_lane_type(r - 1) == 'safe':
                pygame.draw.rect(screen, (245, 238, 48, 100), (0, y, WIDTH, 2))

    # Zebra crossings
    for r in [ROWS - 1, 5, 10]:
        y = r * GRID_SIZE
        for i in range(COLS):
            if i % 2 == 0:
                pygame.draw.rect(screen, (255, 255, 255, 25), (i * GRID_SIZE + 10, y + 5, 30, GRID_SIZE - 10))

# Game Loop
running = True
while running:
    # Handle Events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
            
        elif event.type == pygame.KEYDOWN:
            if game_state == 'START':
                if event.key == pygame.K_SPACE or event.key == pygame.K_RETURN:
                    # Start Game
                    game_state = 'PLAYING'
                    score = 0
                    lives = 3
                    obstacles.clear()
                    particles.clear()
                    player.reset()
                    
            elif game_state == 'PLAYING':
                moved = False
                if event.key in [pygame.K_UP, pygame.K_w]:
                    moved = player.move(0, -1, 'up')
                elif event.key in [pygame.K_DOWN, pygame.K_s]:
                    moved = player.move(0, 1, 'down')
                elif event.key in [pygame.K_LEFT, pygame.K_a]:
                    moved = player.move(-1, 0, 'left')
                elif event.key in [pygame.K_RIGHT, pygame.K_d]:
                    moved = player.move(1, 0, 'right')
                    
                if moved:
                    # Spawn feather particles
                    for _ in range(4):
                        particles.append(Particle(player.x + 22, player.y + 40, WHITE, 'feather'))
                        
                    # Score calculation
                    current_level = (ROWS - 1) - player.grid_y
                    if current_level * 10 > score:
                        diff = (current_level * 10) - score
                        score += diff
                        
                        # Reach top goal
                        if player.grid_y == 0:
                            play_sound(score_sound)
                            # Spawn flash particles
                            for _ in range(10):
                                particles.append(Particle(WIDTH // 2, HEIGHT - 25, SECONDARY, 'spark'))
                            pygame.time.delay(200)
                            player.reset()
                            
            elif game_state == 'GAMEOVER':
                if event.key in [pygame.K_SPACE, pygame.K_RETURN]:
                    game_state = 'PLAYING'
                    score = 0
                    lives = 3
                    obstacles.clear()
                    particles.clear()
                    player.reset()

    # Game Logic Updates
    if game_state == 'PLAYING':
        player.update()
        
        # Sakura drifting
        if random.random() < 0.05:
            particles.append(Particle(random.uniform(0, WIDTH * 1.5), -10, None, 'sakura'))
            
        # Spawn traffic
        for lane in LANES:
            if lane["rate"] > 0:
                same_lane_obs = [o for o in obstacles if o.row == lane["row"]]
                can_spawn = True
                for obs in same_lane_obs:
                    if lane["speed"] > 0 and obs.x < 120:
                        can_spawn = False
                    if lane["speed"] < 0 and obs.x > WIDTH - 120:
                        can_spawn = False
                        
                if can_spawn and random.random() < lane["rate"]:
                    speed_var = lane["speed"] * random.uniform(0.8, 1.2)
                    obstacles.append(Obstacle(lane["row"], speed_var, lane["type"]))
                    
        # Update obstacles
        for obs in obstacles:
            obs.update()
            
        # Filter off-screen cars
        obstacles = [o for o in obstacles if not o.is_offscreen()]
        
        # Check Collisions
        player_rect = pygame.Rect(player.x + 6, player.y + 6, 32, 32)
        for obs in obstacles:
            if player_rect.colliderect(obs.get_rect()):
                # COLLISION!
                lives -= 1
                shake_intensity = 15
                
                # Sparks & Feathers
                for _ in range(20):
                    particles.append(Particle(player.x + 22, player.y + 22, PRIMARY, 'spark'))
                for _ in range(12):
                    particles.append(Particle(player.x + 22, player.y + 22, WHITE, 'feather'))
                    
                play_sound(crash_sound)
                
                if lives <= 0:
                    game_state = 'GAMEOVER'
                    play_sound(gameover_sound)
                    if score > high_score:
                        high_score = score
                        save_high_score()
                else:
                    player.reset()
                break

        # Update particles
        for p in particles:
            p.update()
        particles = [p for p in particles if p.alpha > 0]

    # Draw Logic
    if shake_intensity > 0:
        # Screen Shake offset
        offset_x = random.randint(-int(shake_intensity), int(shake_intensity))
        offset_y = random.randint(-int(shake_intensity), int(shake_intensity))
        shake_intensity *= 0.85
        if shake_intensity < 0.5:
            shake_intensity = 0
            
        # Draw on offset temporary surface
        temp_surface = pygame.Surface((WIDTH, HEIGHT))
        draw_background()
        for obs in obstacles:
            obs.draw(temp_surface)
        for p in particles:
            p.draw(temp_surface)
        player.draw(temp_surface)
        screen.blit(temp_surface, (offset_x, offset_y))
    else:
        draw_background()
        for obs in obstacles:
            obs.draw(screen)
        for p in particles:
            p.draw(screen)
        if game_state == 'PLAYING':
            player.draw(screen)

    # Render HUD overlay
    if game_state == 'PLAYING':
        # Current Score
        score_text = font_pixel.render(f"PONTOS: {str(score).zfill(4)}", True, WHITE)
        screen.blit(score_text, (20, 15))
        
        # Vidas
        hearts_text = font_pixel.render(f"VIDAS: {'❤️' * lives}", True, PRIMARY)
        screen.blit(hearts_text, (WIDTH - 150, 15))

    elif game_state == 'START':
        # Anime screen frame
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((15, 12, 27, 220))
        screen.blit(overlay, (0, 0))
        
        logo_top = font_large.render("KOKO-CHAN", True, WHITE)
        logo_sub = font_medium.render("TOKYO CROSSING", True, SECONDARY)
        
        screen.blit(logo_top, (WIDTH // 2 - logo_top.get_width() // 2, HEIGHT // 3 - 50))
        screen.blit(logo_sub, (WIDTH // 2 - logo_sub.get_width() // 2, HEIGHT // 3))
        
        # Badge
        badge = font_pixel.render("[ PRESS SPACE TO START ]", True, YELLOW)
        screen.blit(badge, (WIDTH // 2 - badge.get_width() // 2, HEIGHT // 2 + 20))
        
        instructions = font_medium.render("Ajude o galo lutador a atravessar a rua!", True, TEXT_MUTED)
        screen.blit(instructions, (WIDTH // 2 - instructions.get_width() // 2, HEIGHT // 2 + 80))
        
        hs_text = font_pixel.render(f"Recorde: {high_score} pts", True, WHITE)
        screen.blit(hs_text, (WIDTH // 2 - hs_text.get_width() // 2, HEIGHT // 2 + 130))

    elif game_state == 'GAMEOVER':
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((15, 12, 27, 240))
        screen.blit(overlay, (0, 0))
        
        go_title = font_large.render("FIM DE JOGO", True, PRIMARY)
        score_info = font_medium.render(f"Pontos Finais: {score}", True, WHITE)
        hs_info = font_medium.render(f"Recorde Atual: {high_score}", True, YELLOW)
        restart_info = font_pixel.render("[ Aperte SPACE para jogar novamente ]", True, SECONDARY)
        
        screen.blit(go_title, (WIDTH // 2 - go_title.get_width() // 2, HEIGHT // 3))
        screen.blit(score_info, (WIDTH // 2 - score_info.get_width() // 2, HEIGHT // 2 - 20))
        screen.blit(hs_info, (WIDTH // 2 - hs_info.get_width() // 2, HEIGHT // 2 + 20))
        screen.blit(restart_info, (WIDTH // 2 - restart_info.get_width() // 2, HEIGHT // 2 + 100))

    pygame.display.flip()
    clock.tick(FPS)

pygame.quit()
sys.exit()
