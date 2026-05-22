#!/usr/bin/env python3
"""
SalesPulse Platform Visual Guide
Based on "Navigational Clarity" design philosophy
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, Circle, FancyArrowPatch
import matplotlib.lines as mlines
import numpy as np
from matplotlib import rcParams

# Set up clean, professional styling
plt.style.use('default')
rcParams['font.family'] = 'sans-serif'
rcParams['font.sans-serif'] = ['Helvetica Neue', 'Arial', 'DejaVu Sans']
rcParams['axes.facecolor'] = '#FAFBFC'
rcParams['figure.facecolor'] = '#FFFFFF'
rcParams['text.color'] = '#1A1A2E'
rcParams['axes.edgecolor'] = '#E4E7EB'
rcParams['axes.linewidth'] = 0.5

# Color palette - Navigational Clarity
PRIMARY = '#0066CC'  # Trust blue
SECONDARY = '#00A3E0'  # Flow cyan
ACCENT = '#FF6B35'  # Action orange
LIGHT_BLUE = '#E8F4FC'
LIGHT_CYAN = '#E0F7FA'
LIGHT_ORANGE = '#FFF3E0'
SUCCESS = '#2ECC71'
NEUTRAL_DARK = '#2C3E50'
NEUTRAL_MEDIUM = '#7F8C8D'
NEUTRAL_LIGHT = '#BDC3C7'

# Canvas dimensions
fig = plt.figure(figsize=(16, 12), dpi=150)
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 16)
ax.set_ylim(0, 12)
ax.axis('off')

# Title section
ax.text(8, 11.3, 'SalesPulse', fontsize=32, fontweight='bold', 
        ha='center', va='center', color=PRIMARY)
ax.text(8, 10.8, 'Platform Navigation Guide', fontsize=16, 
        ha='center', va='center', color=NEUTRAL_MEDIUM)
ax.text(8, 10.4, 'AAA Travel & Insurance Analytics Dashboard', fontsize=11, 
        ha='center', va='center', color=NEUTRAL_LIGHT, style='italic')

# Draw horizontal divider
ax.plot([2, 14], [10.1, 10.1], color=NEUTRAL_LIGHT, linewidth=1.5)

# Central hub - Dashboard
dashboard = FancyBboxPatch((6.5, 7.2), 3, 1.2, 
                            boxstyle="round,pad=0.05,rounding_size=0.15",
                            facecolor=PRIMARY, edgecolor='none', alpha=0.95)
ax.add_patch(dashboard)
ax.text(8, 7.65, 'DASHBOARD', fontsize=16, fontweight='bold', 
        ha='center', va='center', color='white')
ax.text(8, 7.25, 'Home Base', fontsize=10, ha='center', va='center', 
        color='white', alpha=0.8)

# Secondary features - surrounding the dashboard
# Left column
features_left = [
    ('Pipeline', '🔄', 2.5, 8.8, LIGHT_BLUE, 'Sales Pipeline'),
    ('Opportunities', '🎯', 2.5, 7.4, LIGHT_CYAN, 'Top Deals'),
    ('Revenue', '💰', 2.5, 6.0, LIGHT_BLUE, 'Revenue Analysis'),
]

# Right column  
features_right = [
    ('Travel', '✈️', 13.5, 8.8, LIGHT_ORANGE, 'Travel Analytics'),
    ('Leads', '📈', 13.5, 7.4, LIGHT_CYAN, 'Lead Funnel'),
    ('Customers', '👥', 13.5, 6.0, LIGHT_BLUE, 'Customer Insights'),
]

# Top row
features_top = [
    ('Monthly Report', '📅', 4.5, 9.8, LIGHT_CYAN),
    ('Market Pulse', '📡', 8, 9.8, LIGHT_ORANGE),
    ('Territory', '🗺️', 11.5, 9.8, LIGHT_BLUE),
]

# Bottom row
features_bottom = [
    ('Cross-Sell', '💡', 4.5, 4.8, LIGHT_ORANGE),
    ('Help', '❓', 8, 4.8, LIGHT_CYAN),
    ('Settings', '⚙️', 11.5, 4.8, LIGHT_BLUE),
]

# Draw features
def draw_feature(ax, name, icon, x, y, color, subtitle=''):
    # Box
    box = FancyBboxPatch((x-1.3, y-0.6), 2.6, 1.2,
                        boxstyle="round,pad=0.03,rounding_size=0.1",
                        facecolor=color, edgecolor=NEUTRAL_LIGHT, 
                        linewidth=1.5, alpha=0.9)
    ax.add_patch(box)
    
    # Icon and text
    ax.text(x, y+0.3, icon, fontsize=14, fontweight='bold', ha='center', va='center', color=PRIMARY)
    ax.text(x, y-0.05, name, fontsize=10, fontweight='bold', 
            ha='center', va='center', color=NEUTRAL_DARK)
    if subtitle:
        ax.text(x, y-0.35, subtitle, fontsize=7.5, 
                ha='center', va='center', color=NEUTRAL_MEDIUM)

# Draw connections
def draw_connection(ax, x1, y1, x2, y2, color):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color, 
                               lw=1.5, connectionstyle='arc3,rad=0'))

# Draw left features
for name, icon, x, y, color, subtitle in features_left:
    draw_feature(ax, name, icon, x, y, color, subtitle)
    draw_connection(ax, x+1.3, y, 6.5, 7.8, NEUTRAL_LIGHT)

# Draw right features
for name, icon, x, y, color, subtitle in features_right:
    draw_feature(ax, name, icon, x, y, color, subtitle)
    draw_connection(ax, x-1.3, y, 9.5, 7.8, NEUTRAL_LIGHT)

# Draw top features
for name, icon, x, y, color in features_top:
    draw_feature(ax, name, icon, x, y, color)
    draw_connection(ax, x, y-0.6, 8, 8.4, NEUTRAL_LIGHT)

# Draw bottom features
for name, icon, x, y, color in features_bottom:
    draw_feature(ax, name, icon, x, y, color)
    draw_connection(ax, x, y+0.6, 8, 7.2, NEUTRAL_LIGHT)

# Additional features - smaller cards at bottom
other_features = [
    ('Agent View', 'AGENT', 2, 2.5),
    ('Customer Profile', 'PROFILE', 5, 2.5),
    ('Census Data', 'CENSUS', 8, 2.5),
    ('Issues', 'ISSUES', 11, 2.5),
    ('Territory Map', 'MAP', 14, 2.5),
]

ax.text(8, 3.4, 'Additional Features', fontsize=11, fontweight='bold',
        ha='center', va='center', color=NEUTRAL_DARK)

for name, icon, x, y in other_features:
    box = FancyBboxPatch((x-0.9, y-0.4), 1.8, 0.8,
                        boxstyle="round,pad=0.02,rounding_size=0.08",
                        facecolor=LIGHT_BLUE, edgecolor=NEUTRAL_LIGHT,
                        linewidth=1, alpha=0.8)
    ax.add_patch(box)
    ax.text(x, y+0.1, icon, fontsize=8, fontweight='bold', ha='center', va='center', color=PRIMARY)
    ax.text(x, y-0.15, name, fontsize=7, ha='center', va='center',
            color=NEUTRAL_DARK)

# Workflow arrows at bottom
ax.text(8, 1.5, 'Typical User Journey', fontsize=10, fontweight='bold',
        ha='center', va='center', color=PRIMARY)

# Journey steps
steps = ['Login', 'Dashboard', 'Explore', 'Analyze', 'Report']
step_x = [3, 5.5, 8, 10.5, 13]
step_y = 0.8

for i, (step, x) in enumerate(zip(steps, step_x)):
    circle = Circle((x, step_y), 0.3, facecolor=PRIMARY if i > 0 else ACCENT,
                    edgecolor='white', linewidth=2)
    ax.add_patch(circle)
    ax.text(x, step_y, str(i+1), fontsize=10, fontweight='bold',
            ha='center', va='center', color='white')
    ax.text(x, step_y-0.5, step, fontsize=8, ha='center', va='center',
            color=NEUTRAL_DARK)
    
    if i < len(steps)-1:
        ax.annotate('', xy=(step_x[i+1]-0.35, step_y), 
                   xytext=(x+0.35, step_y),
                   arrowprops=dict(arrowstyle='->', color=NEUTRAL_LIGHT, lw=2))

# Key metrics box
metrics_box = FancyBboxPatch((0.5, 4.2), 1.8, 3.5,
                             boxstyle="round,pad=0.03,rounding_size=0.1",
                             facecolor=LIGHT_CYAN, edgecolor=SECONDARY,
                             linewidth=2, alpha=0.9)
ax.add_patch(metrics_box)
ax.text(1.4, 7.3, 'Key Metrics', fontsize=9, fontweight='bold',
        ha='center', va='center', color=PRIMARY)
ax.text(0.8, 6.9, 'Revenue', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)
ax.text(0.8, 6.5, 'Pipeline Value', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)
ax.text(0.8, 6.1, 'Win Rate', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)
ax.text(0.8, 5.7, 'Conversion', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)
ax.text(0.8, 5.3, 'Targets', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)

# Quick actions box
actions_box = FancyBboxPatch((13.7, 4.2), 1.8, 3.5,
                              boxstyle="round,pad=0.03,rounding_size=0.1",
                              facecolor=LIGHT_ORANGE, edgecolor=ACCENT,
                              linewidth=2, alpha=0.9)
ax.add_patch(actions_box)
ax.text(14.6, 7.3, 'Quick Actions', fontsize=9, fontweight='bold',
        ha='center', va='center', color=ACCENT)
ax.text(14.0, 6.9, 'Filter Data', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)
ax.text(14.0, 6.5, 'Export Reports', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)
ax.text(14.0, 6.1, 'Date Range', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)
ax.text(14.0, 5.7, 'Compare', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)
ax.text(14.0, 5.3, 'Share', fontsize=7, ha='left', va='center',
        color=NEUTRAL_DARK)

# Footer
ax.text(8, 0.15, 'SalesPulse v1.0 • AAA Travel & Insurance • Built with FastAPI + React', 
        fontsize=8, ha='center', va='center', color=NEUTRAL_LIGHT)

# Save
plt.savefig('docs/tutorials/salespulse-navigation-guide.png', 
            dpi=150, bbox_inches='tight', 
            facecolor='white', edgecolor='none',
            format='png')
print("✅ Visual guide created: docs/tutorials/salespulse-navigation-guide.png")
