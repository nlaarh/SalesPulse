#!/usr/bin/env python3
"""
SalesPulse Animated User Journey GIF
Creates a looping animation showing common user workflows
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, Circle, FancyArrowPatch, Rectangle
import numpy as np
from PIL import Image
import io
import os

# Color palette
PRIMARY = '#0066CC'
SECONDARY = '#00A3E0'
ACCENT = '#FF6B35'
LIGHT_BLUE = '#E8F4FC'
LIGHT_CYAN = '#E0F7FA'
LIGHT_ORANGE = '#FFF3E0'
NEUTRAL_DARK = '#2C3E50'
NEUTRAL_MEDIUM = '#7F8C8D'
NEUTRAL_LIGHT = '#E4E7EB'
WHITE = '#FFFFFF'

# Frame configurations
def create_frame(frame_num, total_frames=30):
    """Create a single frame of the animation"""
    fig = plt.figure(figsize=(12, 8), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 8)
    ax.axis('off')
    
    # Background
    ax.add_patch(Rectangle((0, 0), 12, 8, facecolor=WHITE, edgecolor='none'))
    
    # Header
    ax.add_patch(Rectangle((0, 7.2), 12, 0.8, facecolor=PRIMARY, edgecolor='none'))
    ax.text(6, 7.6, 'SalesPulse - Quick Start Guide', fontsize=18, fontweight='bold',
            ha='center', va='center', color=WHITE)
    
    # Progress indicator
    progress = frame_num / total_frames
    
    # Show different stages based on frame number
    stage = int(frame_num / (total_frames / 5))
    
    if stage == 0:
        # Stage 1: Login
        draw_login(ax, frame_num)
        step_num = 1
    elif stage == 1:
        # Stage 2: Dashboard
        draw_dashboard(ax, frame_num - 6)
        step_num = 2
    elif stage == 2:
        # Stage 3: Explore Pipeline
        draw_pipeline(ax, frame_num - 12)
        step_num = 3
    elif stage == 3:
        # Stage 4: View Opportunities
        draw_opportunities(ax, frame_num - 18)
        step_num = 4
    else:
        # Stage 5: Generate Report
        draw_report(ax, frame_num - 24)
        step_num = 5
    
    # Progress bar
    draw_progress_bar(ax, progress)
    
    # Step indicator
    steps = ['Login', 'Dashboard', 'Pipeline', 'Opportunities', 'Report']
    draw_step_indicator(ax, steps, step_num - 1)
    
    # Footer
    ax.text(6, 0.3, f'Frame {frame_num + 1}/{total_frames}', fontsize=9,
            ha='center', va='center', color=NEUTRAL_MEDIUM)
    
    # Convert to image
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', facecolor=WHITE)
    buf.seek(0)
    img = Image.open(buf).convert('RGBA')
    plt.close()
    
    return img

def draw_login(ax, frame):
    """Animate login screen"""
    # Fade in effect
    alpha = min(1.0, frame / 5)
    
    # Login box
    box = FancyBboxPatch((4, 3), 4, 2.5,
                         boxstyle="round,pad=0.05,rounding_size=0.2",
                         facecolor=LIGHT_BLUE, edgecolor=PRIMARY,
                         linewidth=2, alpha=alpha)
    ax.add_patch(box)
    
    # Title
    ax.text(6, 5.1, 'Welcome to SalesPulse', fontsize=14, fontweight='bold',
            ha='center', va='center', color=PRIMARY, alpha=alpha)
    
    # Username field
    ax.add_patch(Rectangle((4.5, 4.2), 3, 0.4, facecolor=WHITE,
                           edgecolor=NEUTRAL_LIGHT, linewidth=1, alpha=alpha))
    ax.text(6, 4.4, 'Username', fontsize=10, ha='center', va='center',
            color=NEUTRAL_MEDIUM, alpha=alpha)
    
    # Password field
    ax.add_patch(Rectangle((4.5, 3.5), 3, 0.4, facecolor=WHITE,
                           edgecolor=NEUTRAL_LIGHT, linewidth=1, alpha=alpha))
    ax.text(6, 3.7, 'Password', fontsize=10, ha='center', va='center',
            color=NEUTRAL_MEDIUM, alpha=alpha)
    
    # Login button
    ax.add_patch(FancyBboxPatch((5.5, 2.9), 1.5, 0.4,
                               boxstyle="round,pad=0.02,rounding_size=0.1",
                               facecolor=PRIMARY, edgecolor='none', alpha=alpha))
    ax.text(6.25, 3.1, 'Sign In', fontsize=11, fontweight='bold',
            ha='center', va='center', color=WHITE, alpha=alpha)

def draw_dashboard(ax, frame):
    """Animate dashboard"""
    # Sidebar
    ax.add_patch(Rectangle((0.2, 0.8), 2, 6, facecolor=LIGHT_BLUE,
                           edgecolor=NEUTRAL_LIGHT, linewidth=1))
    
    # Menu items
    menu_items = ['Dashboard', 'Pipeline', 'Opportunities', 'Travel', 'Reports']
    for i, item in enumerate(menu_items):
        color = PRIMARY if i == 0 else NEUTRAL_LIGHT
        ax.add_patch(Rectangle((0.3, 5.5 - i*0.8), 1.8, 0.6,
                              facecolor=color, edgecolor='none', alpha=0.8))
        ax.text(1.2, 5.8 - i*0.8, item, fontsize=9, fontweight='bold' if i==0 else 'normal',
                ha='center', va='center', color=PRIMARY if i==0 else NEUTRAL_DARK)
    
    # Main content area
    ax.add_patch(Rectangle((2.5, 0.8), 9, 6, facecolor=WHITE,
                           edgecolor=NEUTRAL_LIGHT, linewidth=1))
    
    # Welcome message
    ax.text(7, 6.3, 'Welcome Back!', fontsize=16, fontweight='bold',
            ha='center', va='center', color=NEUTRAL_DARK)
    
    # Metric cards
    metrics = [('Revenue', '$1.2M', LIGHT_CYAN), ('Pipeline', '$3.4M', LIGHT_BLUE),
               ('Won Deals', '156', LIGHT_ORANGE)]
    
    for i, (title, value, color) in enumerate(metrics):
        x = 3 + i * 2.8
        ax.add_patch(FancyBboxPatch((x, 4.5), 2.3, 1.3,
                                   boxstyle="round,pad=0.02,rounding_size=0.1",
                                   facecolor=color, edgecolor=NEUTRAL_LIGHT,
                                   linewidth=1, alpha=min(1.0, frame/10)))
        ax.text(x + 1.15, 5.4, title, fontsize=9, ha='center', va='center',
                color=NEUTRAL_MEDIUM)
        ax.text(x + 1.15, 4.9, value, fontsize=14, fontweight='bold',
                ha='center', va='center', color=PRIMARY)

def draw_pipeline(ax, frame):
    """Animate pipeline view"""
    # Simplified pipeline visualization
    ax.text(6, 6.5, 'Sales Pipeline', fontsize=16, fontweight='bold',
            ha='center', va='center', color=NEUTRAL_DARK)
    
    # Pipeline stages
    stages = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won']
    colors = [LIGHT_BLUE, LIGHT_CYAN, LIGHT_ORANGE, LIGHT_BLUE, LIGHT_CYAN]
    
    bar_width = 1.8
    spacing = 0.2
    start_x = 1.2
    
    for i, (stage, color) in enumerate(zip(stages, colors)):
        x = start_x + i * (bar_width + spacing)
        height = 1.5 + (4-i) * 0.8
        alpha = min(1.0, max(0.3, (frame - i*2) / 5))
        
        ax.add_patch(Rectangle((x, 1.5), bar_width, height,
                              facecolor=color, edgecolor=PRIMARY,
                              linewidth=2, alpha=alpha))
        ax.text(x + bar_width/2, 1.2, stage, fontsize=9, fontweight='bold',
                ha='center', va='center', color=NEUTRAL_DARK, alpha=alpha)

def draw_opportunities(ax, frame):
    """Animate opportunities view"""
    ax.text(6, 6.5, 'Top Opportunities', fontsize=16, fontweight='bold',
            ha='center', va='center', color=NEUTRAL_DARK)
    
    # Table header
    ax.add_patch(Rectangle((1.5, 5.5), 9, 0.5, facecolor=PRIMARY, edgecolor='none'))
    ax.text(2.5, 5.75, 'Account', fontsize=10, fontweight='bold',
            ha='left', va='center', color=WHITE)
    ax.text(6, 5.75, 'Stage', fontsize=10, fontweight='bold',
            ha='center', va='center', color=WHITE)
    ax.text(9.5, 5.75, 'Value', fontsize=10, fontweight='bold',
            ha='right', va='center', color=WHITE)
    
    # Table rows
    opportunities = [
        ('Acme Corp', 'Proposal', '$125K', LIGHT_BLUE),
        ('TechStart Inc', 'Negotiation', '$89K', WHITE),
        ('Global Services', 'Qualified', '$67K', LIGHT_CYAN),
        ('City Bank', 'Lead', '$45K', WHITE),
    ]
    
    for i, (account, stage, value, color) in enumerate(opportunities):
        y = 5 - (i + 1) * 0.7
        alpha = min(1.0, max(0.3, (frame - i) / 3))
        
        ax.add_patch(Rectangle((1.5, y), 9, 0.6, facecolor=color,
                              edgecolor=NEUTRAL_LIGHT, linewidth=0.5, alpha=alpha))
        ax.text(2.5, y + 0.3, account, fontsize=9, ha='left', va='center',
                color=NEUTRAL_DARK, alpha=alpha)
        ax.text(6, y + 0.3, stage, fontsize=9, ha='center', va='center',
                color=PRIMARY, alpha=alpha)
        ax.text(9.5, y + 0.3, value, fontsize=9, fontweight='bold', ha='right',
                va='center', color=ACCENT, alpha=alpha)

def draw_report(ax, frame):
    """Animate report generation"""
    ax.text(6, 6.5, 'Generate Report', fontsize=16, fontweight='bold',
            ha='center', va='center', color=NEUTRAL_DARK)
    
    # Report options
    options = [
        ('Monthly Summary', LIGHT_BLUE, True),
        ('Revenue Analysis', LIGHT_CYAN, True),
        ('Pipeline Status', LIGHT_ORANGE, True),
        ('Agent Performance', LIGHT_BLUE, False),
    ]
    
    for i, (option, color, selected) in enumerate(options):
        y = 5.5 - i * 0.8
        alpha = min(1.0, max(0.3, (frame - i) / 3))
        
        # Checkbox
        if selected:
            ax.add_patch(Rectangle((2, y), 0.3, 0.3,
                                  facecolor=PRIMARY, edgecolor=PRIMARY, alpha=alpha))
            ax.text(2.15, y + 0.15, '✓', fontsize=10, fontweight='bold',
                   ha='center', va='center', color=WHITE, alpha=alpha)
        else:
            ax.add_patch(Rectangle((2, y), 0.3, 0.3,
                                  facecolor=WHITE, edgecolor=NEUTRAL_LIGHT,
                                  linewidth=1, alpha=alpha))
        
        # Label
        ax.text(2.5, y + 0.15, option, fontsize=11, ha='left', va='center',
                color=NEUTRAL_DARK, alpha=alpha)
    
    # Generate button
    if frame > 15:
        alpha = min(1.0, (frame - 15) / 5)
        ax.add_patch(FancyBboxPatch((4.5, 1.5), 3, 0.6,
                                   boxstyle="round,pad=0.03,rounding_size=0.15",
                                   facecolor=ACCENT, edgecolor='none', alpha=alpha))
        ax.text(6, 1.8, 'Generate Report', fontsize=12, fontweight='bold',
                ha='center', va='center', color=WHITE, alpha=alpha)

def draw_progress_bar(ax, progress):
    """Draw progress bar at bottom"""
    bar_width = 4
    start_x = 4
    y = 0.8
    
    # Background
    ax.add_patch(Rectangle((start_x, y), bar_width, 0.15,
                          facecolor=NEUTRAL_LIGHT, edgecolor='none'))
    
    # Progress
    ax.add_patch(Rectangle((start_x, y), bar_width * progress, 0.15,
                          facecolor=PRIMARY, edgecolor='none'))

def draw_step_indicator(ax, steps, current):
    """Draw step indicators"""
    total = len(steps)
    start_x = 3
    spacing = 1.5
    
    for i, step in enumerate(steps):
        x = start_x + i * spacing
        color = PRIMARY if i <= current else NEUTRAL_LIGHT
        
        # Circle
        ax.add_patch(Circle((x, 1.5), 0.25, facecolor=color,
                           edgecolor=WHITE, linewidth=2))
        ax.text(x, 1.5, str(i+1), fontsize=9, fontweight='bold',
                ha='center', va='center', color=WHITE)
        
        # Label
        alpha = 1.0 if i <= current else 0.4
        ax.text(x, 1.1, step, fontsize=8, ha='center', va='center',
                color=NEUTRAL_DARK, alpha=alpha)

# Create animated GIF
print("Creating animated GIF...")
frames = []
total_frames = 30

for i in range(total_frames):
    print(f"Creating frame {i+1}/{total_frames}...", end='\r')
    frame = create_frame(i, total_frames)
    frames.append(frame)

print("\nSaving GIF...")

# Save as GIF
output_path = 'docs/tutorials/salespulse-user-journey.gif'
frames[0].save(
    output_path,
    save_all=True,
    append_images=frames[1:],
    duration=100,  # 100ms per frame
    loop=0  # Loop forever
)

print(f"✅ Animated GIF created: {output_path}")
print(f"   Total frames: {len(frames)}")
print(f"   Duration: {len(frames) * 0.1:.1f} seconds")
