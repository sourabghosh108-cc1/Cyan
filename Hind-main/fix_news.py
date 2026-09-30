import re

filepath = r'c:\Users\ACER\Desktop\LemonIndia-DSC\Lemon Proj\Hind-main\Hind-main\apps\webstore\news\index.html'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()
    
# Remove Category Nav Tabs
content = re.sub(r'<!-- Category Nav Tabs -->.*?</nav>', '', content, flags=re.DOTALL)

# Remove loader and grid
content = re.sub(r'<div id="newsLoader" class="text-center py-5">.*?</div>\s*<!-- News Grid Container -->\s*<div class="row g-4" id="newsGrid" style="display: none;"></div>', '', content, flags=re.DOTALL)

# Remove mt-5 from rss-container to let it fit nicely
content = content.replace('<div class="rss-container mt-5">', '<div class="rss-container">')

# Make the RSS frame taller
content = content.replace('rssfeed_frame_height="400";', 'rssfeed_frame_height="800";')
content = content.replace('rssfeed_no_items="10";', 'rssfeed_no_items="20";')

# Remove mock data and logic from script
content = re.sub(r'// Live News Mock & Fetch Data.*?// Initialize\s*setTimeout\(\(\) => \{\s*renderNews\(\'all\'\);\s*\}, 300\);', '', content, flags=re.DOTALL)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("News fixed!")
