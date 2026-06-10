import pygame
import sys
import random
import os
import math
import json

# Initialize Pygame
pygame.init()
pygame.mixer.init()

# Game Constants
WIDTH, HEIGHT = 600, 700
GRID_SIZE = 50
COLS = 12
ROWS = 14
FPS = 60

# Palette Colors (Anime arcade theme)
BG_DARK = (15, 12, 27)
ROAD_COLOR = (22, 19, 43)
SAFE_COLOR = (38, 29, 61)
PRIMARY = (255, 42, 116)
SECONDARY = (5, 217, 232)
YELLOW = (245, 238, 48)
WHITE = (255, 255, 255)
TEXT_MUTED = (139, 139, 184)

# Create Screen Window
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Koko-chan 3D: Tokyo Crossing (Rooster Fighter)")
clock = pygame.time.Clock()

# Sound Synthesis
def generate_beep_sound(freq_start, freq_end, duration_ms, volume=0.1):
    try:
        sample_rate = 44100
        n_samples = int(sample_rate * (duration_ms / 1000.0))
        buf = bytearray()
        for i in range(n_samples):
            t = float(i) / sample_rate
            freq = freq_start + (freq_end - freq_start) * (float(i) / n_samples)
            val = int(32767 * math.sin(2.0 * math.pi * freq * t) * volume)
            buf.extend(val.to_bytes(2, byteorder='little', signed=True))
        return pygame.mixer.Sound(buffer=buf)
    except Exception as e:
        print(f"Sound synth error: {e}")
        return None

jump_sound = generate_beep_sound(150, 800, 150, 0.15)
crash_sound = generate_beep_sound(300, 40, 400, 0.25)
score_sound = generate_beep_sound(523, 783, 300, 0.15)
gameover_sound = generate_beep_sound(440, 110, 800, 0.2)

def play_sound(sound):
    if sound:
        sound.play()


# ----------------- ISOMETRIC 3D RENDER ENGINE -----------------

# Projection parameters
# x3d is horizontal (columns), z3d is depth (rows), y3d is vertical height
ISO_ANGLE = math.radians(26)  # 26 degrees yields a nice clean look
COS_A = math.cos(ISO_ANGLE)
SIN_A = math.sin(ISO_ANGLE)
SCALE_3D = 18.0  # Scale factor

# Grid mapping: map row index/col index to 3D units
# Grid center is at x3d=0, z3d=0
def grid_to_3d(col, row):
    x3d = (col - COLS / 2.0) * 2.2
    z3d = (row - ROWS / 2.0) * 2.2
    return x3d, z3d

def project_iso(x3d, y3d, z3d):
    cx = WIDTH // 2
    cy = HEIGHT // 2 + 50
    
    # Rotate and project
    screen_x = cx + (x3d - z3d) * COS_A * SCALE_3D
    screen_y = cy + (x3d + z3d) * SIN_A * SCALE_3D - y3d * SCALE_3D
    return int(screen_x), int(screen_y)

# Helper to shade faces differently for 3D depth illusion
def adjust_color(color, factor):
    r = max(0, min(255, int(color[0] * factor)))
    g = max(0, min(255, int(color[1] * factor)))
    b = max(0, min(255, int(color[2] * factor)))
    return (r, g, b)

# Draw a 3D box (voxel block)
def draw_3d_box(surface, x, y, z, dx, dy, dz, color):
    # Calculate 8 vertices
    # Bottom vertices
    b000 = project_iso(x, y, z)
    b100 = project_iso(x + dx, y, z)
    b101 = project_iso(x + dx, y, z + dz)
    b001 = project_iso(x, y, z + dz)
    
    # Top vertices
    t000 = project_iso(x, y + dy, z)
    t100 = project_iso(x + dx, y + dy, z)
    t101 = project_iso(x + dx, y + dy, z + dz)
    t001 = project_iso(x, y + dy, z + dz)
    
    # Define face colors based on shading
    top_color = adjust_color(color, 1.1)    # Brightest from top
    left_color = adjust_color(color, 0.85)  # Medium
    right_color = adjust_color(color, 0.65) # Darkest shadow

    # Draw Left face (facing front-left)
    pygame.draw.polygon(surface, left_color, [b000, b001, t001, t000])
    pygame.draw.polygon(surface, (10, 10, 25), [b000, b001, t001, t000], 1) # thin outline
    
    # Draw Right face (facing front-right)
    pygame.draw.polygon(surface, right_color, [b001, b101, t101, t001])
    pygame.draw.polygon(surface, (10, 10, 25), [b001, b101, t101, t001], 1)
    
    # Draw Top face
    pygame.draw.polygon(surface, top_color, [t000, t100, t101, t001])
    pygame.draw.polygon(surface, (10, 10, 25), [t000, t100, t101, t001], 1)


# ----------------- LEADERBOARD LOGIC -----------------
def load_leaderboard():
    if os.path.exists('leaderboard.json'):
        try:
            with open('leaderboard.json', 'r') as f:
                return json.load(f)
        except:
            pass
    # Defaults
    return [
        {"name": "KEIJI", "score": 150},
        {"name": "GALODOIDO", "score": 100},
        {"name": "CHICCO", "score": 80},
        {"name": "SASA", "score": 50},
        {"name": "PIUPIU", "score": 20}
    ]

def save_leaderboard(list_data):
    try:
        with open('leaderboard.json', 'w') as f:
            json.dump(list_data, f)
    except Exception as e:
        print(f"Save ranking failed: {e}")

def add_score(name, score_val):
    list_data = load_leaderboard()
    sanitized = name.strip().upper() or "ANONIMO"
    list_data.append({"name": sanitized, "score": score_val})
    # Sort descending
    list_data.sort(key=lambda x: x["score"], reverse=True)
    # Top 5
    top5 = list_data[:5]
    save_leaderboard(top5)
    
    # Return true if new top high score
    return top5[0]["name"] == sanitized and top5[0]["score"] == score_val


# ----------------- GAME CLASSES -----------------

class Particle:
    def __init__(self, x3d, y3d, z3d, color, p_type):
        self.x = x3d
        self.y = y3d
        self.z = z3d
        self.color = color
        self.type = p_type
        
        self.vx = random.uniform(-0.1, 0.1)
        self.vy = random.uniform(0.05, 0.25) if p_type == 'spark' else random.uniform(-0.02, 0.05)
        self.vz = random.uniform(-0.1, 0.1)
        
        if p_type == 'sakura':
            self.vx = random.uniform(-0.1, -0.05)
            self.vy = random.uniform(-0.05, -0.02)
            self.vz = random.uniform(-0.05, -0.02)
            
        self.size = random.uniform(0.1, 0.4)
        self.alpha = 255
        self.decay = random.uniform(3, 7)

    def update(self):
        self.x += self.vx
        self.y += self.vy
        self.z += self.vz
        
        if self.type != 'spark':
            self.vy -= 0.002 # gravity drift
            
        self.alpha = max(0, self.alpha - self.decay)

    def draw(self, surface):
        # Project 3D particle coordinate to screen
        pos = project_iso(self.x, self.y, self.z)
        
        # Clip off-screen draw calls
        if not (0 <= pos[0] < WIDTH and 0 <= pos[1] < HEIGHT):
            return
            
        # Draw transparent particles
        s = pygame.Surface((12, 12), pygame.SRCALPHA)
        color_w_alpha = (self.color[0], self.color[1], self.color[2], int(self.alpha))
        
        if self.type == 'sakura':
            pygame.draw.ellipse(s, (255, 183, 197, int(self.alpha)), (0, 0, 8, 10))
        elif self.type == 'feather':
            pygame.draw.ellipse(s, (255, 255, 255, int(self.alpha)), (0, 0, 10, 6))
        else:
            pygame.draw.rect(s, color_w_alpha, (0, 0, 6, 6))
            
        surface.blit(s, (pos[0] - 6, pos[1] - 6))


class Player3D:
    def __init__(self):
        self.reset()
        self.jump_duration = 15
        self.is_jumping = False
        self.jump_time = 0

    def reset(self):
        self.grid_x = COLS // 2
        self.grid_y = ROWS - 1
        
        x3d, z3d = grid_to_3d(self.grid_x, self.grid_y)
        self.x = x3d
        self.y = 0.0
        self.z = z3d
        
        self.target_x = x3d
        self.target_z = z3d
        self.jump_start_x = x3d
        self.jump_start_z = z3d
        
        self.facing = 'up' # 'up', 'down', 'left', 'right'

    def move(self, dx, dy, direction):
        if self.is_jumping:
            return False
            
        next_grid_x = self.grid_x + dx
        next_grid_y = self.grid_y + dy
        self.facing = direction

        if 0 <= next_grid_x < COLS and 0 <= next_grid_y < ROWS:
            self.grid_x = next_grid_x
            self.grid_y = next_grid_y
            
            # Start jump details
            self.is_jumping = True
            self.jump_time = 0
            self.jump_start_x = self.x
            self.jump_start_z = self.z
            
            tx, tz = grid_to_3d(self.grid_x, self.grid_y)
            self.target_x = tx
            self.target_z = tz
            
            play_sound(jump_sound)
            return True
        return False

    def update(self):
        if self.is_jumping:
            self.jump_time += 1
            t = self.jump_time / float(self.jump_duration)
            
            # Linear position interpolation
            self.x = self.jump_start_x + (self.target_x - self.jump_start_x) * t
            self.z = self.jump_start_z + (self.target_z - self.jump_start_z) * t
            
            # Height arc (Parabolic jump height)
            self.y = math.sin(t * math.pi) * 1.0
            
            if self.jump_time >= self.jump_duration:
                self.x = self.target_x
                self.z = self.target_z
                self.y = 0.0
                self.is_jumping = False
        else:
            self.x += (self.target_x - self.x) * 0.25
            self.z += (self.target_z - self.z) * 0.25

    def draw(self, surface):
        # Draw player as a 3D assembly of voxel blocks
        # Shifting offsets based on facing direction
        # Keiji dimensions: 0.8 width, 0.8 height, 0.8 depth
        px, py, pz = self.x - 0.4, self.y, self.z - 0.4
        
        # 1. Muscular yellow legs
        draw_3d_box(surface, px + 0.15, py, pz + 0.3, 0.12, 0.2, 0.12, YELLOW)
        draw_3d_box(surface, px + 0.53, py, pz + 0.3, 0.12, 0.2, 0.12, YELLOW)
        
        # 2. Main White Body
        draw_3d_box(surface, px, py + 0.2, pz, 0.8, 0.7, 0.8, WHITE)
        
        # 3. Wings
        draw_3d_box(surface, px - 0.1, py + 0.3, pz + 0.2, 0.1, 0.4, 0.4, WHITE) # left wing
        draw_3d_box(surface, px + 0.8, py + 0.3, pz + 0.2, 0.1, 0.4, 0.4, WHITE) # right wing
        
        # 4. Beak & Comb based on facing direction
        if self.facing == 'up':
            # Comb on top
            draw_3d_box(surface, px + 0.32, py + 0.9, pz + 0.25, 0.16, 0.22, 0.35, PRIMARY)
        elif self.facing == 'down':
            # Beak in front
            draw_3d_box(surface, px + 0.3, py + 0.5, pz - 0.15, 0.2, 0.15, 0.15, YELLOW)
            # Comb on top
            draw_3d_box(surface, px + 0.32, py + 0.9, pz + 0.2, 0.16, 0.22, 0.35, PRIMARY)
        elif self.facing == 'left':
            # Beak left
            draw_3d_box(surface, px - 0.15, py + 0.5, pz + 0.3, 0.15, 0.15, 0.2, YELLOW)
            # Comb on top
            draw_3d_box(surface, px + 0.25, py + 0.9, pz + 0.32, 0.35, 0.22, 0.16, PRIMARY)
        elif self.facing == 'right':
            # Beak right
            draw_3d_box(surface, px + 0.8, py + 0.5, pz + 0.3, 0.15, 0.15, 0.2, YELLOW)
            # Comb on top
            draw_3d_box(surface, px + 0.2, py + 0.9, pz + 0.32, 0.35, 0.22, 0.16, PRIMARY)


class Obstacle3D:
    def __init__(self, row, speed, o_type):
        self.row = row
        self.speed = speed # speed in grid offset units per frame
        self.type = o_type
        
        # Width/Depth metrics in grid unit scale
        self.width = 2.4 if o_type == 'truck' else (0.8 if o_type == 'scooter' else 1.6)
        self.depth = 0.9
        self.height = 1.0 if o_type == 'truck' else (0.5 if o_type == 'scooter' else 0.7)

        # Spawning position
        self.z = grid_to_3d(0, self.row)[1]
        
        # Spawn off-screen
        limit_x = 18.0
        if self.speed > 0:
            self.x = -limit_x
        else:
            self.x = limit_x
            
        self.color = CAR_COLORS[random.randint(0, len(CAR_COLORS) - 1)]

    def update(self):
        self.x += self.speed

    def draw(self, surface):
        ox, oy, oz = self.x - self.width / 2.0, 0.0, self.z - self.depth / 2.0
        
        if self.type == 'truck':
            # Truck chassis
            draw_3d_box(surface, ox + 0.8, oy, oz, 1.6, 1.2, self.depth, WHITE) # Container
            draw_3d_box(surface, ox, oy, oz, 0.8, 0.8, self.depth, SECONDARY)   # Cabin
            # wind shield
            draw_3d_box(surface, ox, oy + 0.4, oz + 0.1, 0.02, 0.3, self.depth - 0.2, (20, 20, 35))
        elif self.type == 'scooter':
            # Scooter body
            draw_3d_box(surface, ox, oy, oz + 0.3, self.width, 0.3, 0.3, PRIMARY)
            draw_3d_box(surface, ox + 0.5, oy + 0.3, oz + 0.3, 0.1, 0.4, 0.1, PRIMARY) # steering column
        else:
            # Voxel Sedan Car
            draw_3d_box(surface, ox, oy, oz, self.width, 0.45, self.depth, self.color)
            draw_3d_box(surface, ox + 0.3, oy + 0.45, oz + 0.05, 1.0, 0.3, self.depth - 0.1, (20, 20, 35))

    def is_offscreen(self):
        limit = 20.0
        if self.speed > 0 and self.x > limit:
            return True
        if self.speed < 0 and self.x < -limit:
            return True
        return False


# Setup game data structures
player = Player3D()
obstacles = []
particles = []
score = 0
lives = 3
high_score = 0
game_state = 'START' # 'START', 'TYPING_NAME', 'PLAYING', 'GAMEOVER'
shake_intensity = 0.0

# Name capture details
player_name = "GALOLUTADOR"

# Car colors definition
CAR_COLORS = [
    (255, 42, 116),
    (5, 217, 232),
    (245, 238, 48),
    (255, 141, 0),
    (155, 81, 224),
    (71, 230, 42)
]

# Grid background draw logic
# Pre-rendered shapes representing pavement and asphalt lanes in isometric 3D
def draw_isometric_environment(surface):
    # Base clear
    surface.fill(BG_DARK)
    
    # Render lanes from Row 0 to ROWS-1 (back to front sorting)
    for r in range(ROWS):
        lane_type = get_lane_type(r)
        lane_z = getZFromRow(r)
        
        # Color profile
        color = SAFE_COLOR if lane_type == 'safe' else ROAD_COLOR
        
        # Let's project pavement block corners
        # Row block starts at x3d = -COLS*2.2/2 = -13.2, ends at +13.2
        # Depth thickness is 2.2 units
        bx = -13.2
        bz = lane_z - 1.1
        
        # Draw 3D lane block
        draw_3d_box(surface, bx, -0.3, bz, 26.4, 0.3, 2.2, color)
        
        # Add visual borders
        if lane_type == 'safe':
            # Cyan neon line front edge
            draw_3d_box(surface, bx, 0.01, bz + 2.1, 26.4, 0.02, 0.05, SECONDARY)
        else:
            # Yellow warning divider next to safe lane
            if get_lane_type(r - 1) == 'safe':
                draw_3d_box(surface, bx, 0.01, bz + 0.1, 26.4, 0.01, 0.08, YELLOW)


def getZFromRow(row):
    # ROAD_START_Z = 21, mapped to GRID_UNIT of 2.2
    return 15.4 - (row * 2.2)

def get_lane_type(row):
    if row == 0 or row == 5 or row == 10 or row == ROWS - 1:
        return 'safe'
    return 'road'


# ----------------- MAIN PYGAME LOOP -----------------

running = True
active_name_input = "GALOLUTADOR"

while running:
    # 1. Event Handling
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
            
        elif event.type == pygame.KEYDOWN:
            if game_state == 'START':
                if event.key in [pygame.K_SPACE, pygame.K_RETURN]:
                    # Transition to typing name
                    game_state = 'TYPING_NAME'
                    active_name_input = ""
                    
            elif game_state == 'TYPING_NAME':
                if event.key == pygame.K_RETURN:
                    if active_name_input.strip() == "":
                        active_name_input = "GALOLUTADOR"
                    player_name = active_name_input.upper()
                    
                    # Start Game
                    game_state = 'PLAYING'
                    score = 0
                    lives = 3
                    obstacles.clear()
                    particles.clear()
                    player.reset()
                    
                elif event.key == pygame.K_BACKSPACE:
                    active_name_input = active_name_input[:-1]
                else:
                    # Append ASCII uppercase characters
                    if len(active_name_input) < 10 and event.unicode.isalnum():
                        active_name_input += event.unicode.upper()
                        
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
                        particles.append(Particle(player.x, player.y + 0.4, player.z, WHITE, 'feather'))
                        
                    # Score evaluation
                    current_level = (ROWS - 1) - player.grid_y
                    if current_level * 10 > score:
                        diff = (current_level * 10) - score
                        score += diff
                        
                        # Reached top goal
                        if player.grid_y == 0:
                            play_sound(score_sound)
                            for _ in range(8):
                                particles.append(Particle(player.x, player.y + 0.2, player.z, SECONDARY, 'spark'))
                            pygame.time.delay(200)
                            player.reset()
                            
            elif game_state == 'GAMEOVER':
                if event.key in [pygame.K_SPACE, pygame.K_RETURN]:
                    # Return to start screen
                    game_state = 'START'

    # 2. Game Logic Updates
    if game_state == 'PLAYING':
        player.update()
        
        # Sakura blossoms drifting
        if random.random() < 0.05:
            # Spawn Sakura tree height
            particles.append(Particle(random.uniform(-10, 15), 5.0, random.uniform(-12, 12), None, 'sakura'))
            
        # Spawn traffic
        for lane in LANES:
            if lane["rate"] > 0:
                same_lane_obs = [o for o in obstacles if o.row == lane["row"]]
                can_spawn = True
                
                # Check spacing
                for obs in same_lane_obs:
                    if lane["speed"] > 0 and obs.x < -14.0:
                        can_spawn = False
                    if lane["speed"] < 0 and obs.x > 14.0:
                        can_spawn = False
                        
                if can_spawn and random.random() < lane["rate"]:
                    speed_var = (lane["speed"] / 12.0) * random.uniform(0.85, 1.25) # Scale grid speed to 3D units per frame
                    obstacles.append(Obstacle3D(lane["row"], speed_var, lane["type"]))
                    
        # Update obstacles
        for obs in obstacles:
            obs.update()
            
        # Filter off-screen obstacles
        obstacles = [o for o in obstacles if not o.is_offscreen()]
        
        # Check Collisions
        if not player.is_jumping or player.y < 0.5:
            pRadius = 0.45
            for obs in obstacles:
                oWidth = 2.3 if obs.type == 'truck' else (0.9 if obs.type == 'scooter' else 1.5)
                oDepth = 0.8
                # Z collision depth check
                if abs(player.z - obs.z) < (pRadius + oDepth / 2.0):
                    # X collision width check
                    if abs(player.x - obs.x) < (pRadius + oWidth / 2.0):
                        # COLLISION!
                        lives -= 1
                        shake_intensity = 12.0
                        
                        # Sparks & Feathers
                        for _ in range(18):
                            particles.append(Particle(player.x, player.y + 0.3, player.z, PRIMARY, 'spark'))
                        for _ in range(10):
                            particles.append(Particle(player.x, player.y + 0.3, player.z, WHITE, 'feather'))
                            
                        play_sound(crash_sound)
                        
                        if lives <= 0:
                            game_state = 'GAMEOVER'
                            play_sound(gameover_sound)
                            add_score(player_name, score)
                        else:
                            player.reset()
                        break
                        
        # Update particles
        for p in particles:
            p.update()
        particles = [p for p in particles if p.alpha > 0]

    # 3. Isometric Draw Rendering
    # Camera shake offset calculations
    offset_x, offset_y = 0, 0
    if shake_intensity > 0:
        offset_x = random.randint(-int(shake_intensity), int(shake_intensity))
        offset_y = random.randint(-int(shake_intensity), int(shake_intensity))
        shake_intensity *= 0.85
        if shake_intensity < 0.5:
            shake_intensity = 0.0

    temp_surface = pygame.Surface((WIDTH, HEIGHT))
    
    # Draw isometric background
    draw_isometric_environment(temp_surface)
    
    # Painter's Algorithm Depth sorting
    # We render Row-by-Row from back to front (Row 0 to ROWS-1)
    for r in range(ROWS):
        lane_z = getZFromRow(r)
        
        # Draw obstacles on this row
        row_obs = [o for o in obstacles if o.row == r]
        for obs in row_obs:
            obs.draw(temp_surface)
            
        # Draw player if they occupy this row
        if game_state == 'PLAYING' and player.grid_y == r:
            player.draw(temp_surface)
            
    # Draw particles (they float in 3D space, drawing order doesn't impact heavily)
    for p in particles:
        p.draw(temp_surface)
        
    # Blit offsetted screen
    screen.blit(temp_surface, (offset_x, offset_y))

    # 4. HUD and Overlays (2D drawings on top)
    if game_state == 'PLAYING':
        score_text = font_pixel.render(f"PONTOS: {str(score).zfill(4)}", True, WHITE)
        name_text = font_pixel.render(f"PILOTO: {player_name}", True, SECONDARY)
        screen.blit(score_text, (20, 15))
        screen.blit(name_text, (20, 35))
        
        hearts_text = font_pixel.render(f"VIDAS: {'❤️' * lives}", True, PRIMARY)
        screen.blit(hearts_text, (WIDTH - 150, 15))

    elif game_state == 'START':
        # Dark overlay
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((15, 12, 27, 210))
        screen.blit(overlay, (0, 0))
        
        title_top = font_large.render("KOKO-CHAN 3D", True, WHITE)
        title_sub = font_medium.render("TOKYO CROSSING", True, SECONDARY)
        
        screen.blit(title_top, (WIDTH // 2 - title_top.get_width() // 2, 80))
        screen.blit(title_sub, (WIDTH // 2 - title_sub.get_width() // 2, 130))
        
        # Rank display
        box_y = 200
        pygame.draw.rect(screen, (34, 26, 54), (120, box_y, 360, 240), border_radius=12)
        pygame.draw.rect(screen, PRIMARY, (120, box_y, 360, 240), 2, border_radius=12)
        
        rank_title = font_medium.render("🏆 TOP 5 SHOBUN", True, YELLOW)
        screen.blit(rank_title, (WIDTH // 2 - rank_title.get_width() // 2, box_y + 15))
        
        leaderboard = load_leaderboard()
        for idx, entry in enumerate(leaderboard):
            rank_txt = font_pixel.render(f"#{idx+1}   {entry['name'].ljust(10)}   {str(entry['score']).zfill(4)} pts", True, WHITE)
            screen.blit(rank_txt, (150, box_y + 60 + idx * 30))
            
        badge = font_pixel.render("[ APERTE SPACE PARA COMEÇAR ]", True, YELLOW)
        screen.blit(badge, (WIDTH // 2 - badge.get_width() // 2, HEIGHT - 180))
        
        tips = font_medium.render("Use WASD ou as Setas do Teclado", True, TEXT_MUTED)
        screen.blit(tips, (WIDTH // 2 - tips.get_width() // 2, HEIGHT - 100))

    elif game_state == 'TYPING_NAME':
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((15, 12, 27, 230))
        screen.blit(overlay, (0, 0))
        
        prompt_txt = font_medium.render("DIGITE SEU CODNOME:", True, SECONDARY)
        screen.blit(prompt_txt, (WIDTH // 2 - prompt_txt.get_width() // 2, HEIGHT // 3 - 20))
        
        # Name typing display
        pygame.draw.rect(screen, ROAD_COLOR, (150, HEIGHT // 3 + 40, 300, 50), border_radius=10)
        pygame.draw.rect(screen, SECONDARY, (150, HEIGHT // 3 + 40, 300, 50), 2, border_radius=10)
        
        type_txt = font_large.render(active_name_input + ("_" if pygame.time.get_ticks() % 1000 < 500 else ""), True, WHITE)
        screen.blit(type_txt, (WIDTH // 2 - type_txt.get_width() // 2, HEIGHT // 3 + 45))
        
        info_txt = font_pixel.render("[ ENTER PARA CONFIRMAR ]", True, YELLOW)
        screen.blit(info_txt, (WIDTH // 2 - info_txt.get_width() // 2, HEIGHT // 3 + 120))

    elif game_state == 'GAMEOVER':
        overlay = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        overlay.fill((15, 12, 27, 240))
        screen.blit(overlay, (0, 0))
        
        go_title = font_large.render("FIM DE JOGO", True, PRIMARY)
        screen.blit(go_title, (WIDTH // 2 - go_title.get_width() // 2, 80))
        
        score_info = font_medium.render(f"Pontos Obtidos: {score}", True, WHITE)
        screen.blit(score_info, (WIDTH // 2 - score_info.get_width() // 2, 140))
        
        # Render updated ranking box
        box_y = 200
        pygame.draw.rect(screen, (34, 26, 54), (120, box_y, 360, 240), border_radius=12)
        pygame.draw.rect(screen, SECONDARY, (120, box_y, 360, 240), 2, border_radius=12)
        
        rank_title = font_medium.render("🏆 RANKING ATUALIZADO", True, YELLOW)
        screen.blit(rank_title, (WIDTH // 2 - rank_title.get_width() // 2, box_y + 15))
        
        leaderboard = load_leaderboard()
        for idx, entry in enumerate(leaderboard):
            color = SECONDARY if entry['name'] == player_name else WHITE
            rank_txt = font_pixel.render(f"#{idx+1}   {entry['name'].ljust(10)}   {str(entry['score']).zfill(4)} pts", True, color)
            screen.blit(rank_txt, (150, box_y + 60 + idx * 30))
            
        restart_txt = font_pixel.render("[ Aperte SPACE para tela inicial ]", True, TEXT_MUTED)
        screen.blit(restart_txt, (WIDTH // 2 - restart_txt.get_width() // 2, HEIGHT - 120))

    pygame.display.flip()
    clock.tick(FPS)

pygame.quit()
sys.exit()
