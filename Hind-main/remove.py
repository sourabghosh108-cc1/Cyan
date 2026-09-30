import re

def remove_voice(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Remove CSS
    content = re.sub(r'/\* ============ 2020-Era Search Engine Voice Search Overlay ============\ \*/.*?}\s*}\s*', '', content, flags=re.DOTALL)
    
    # Remove JS and Overlay HTML
    content = re.sub(r'// ─── 2020-Era Traditional Search Engine Voice Search ─────────────.*?(</body>)', r'\1', content, flags=re.DOTALL)
    
    # Remove Voice Button
    content = re.sub(r'<button type="button" class="voice-search-btn".*?</button>', '', content, flags=re.DOTALL)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

remove_voice('c:/Users/ACER/Desktop/LemonIndia-DSC/Lemon Proj/Hind-main/Hind-main/index.html')
remove_voice('c:/Users/ACER/Desktop/LemonIndia-DSC/Lemon Proj/Hind-main/Hind-main/search.html')
print('Voice removed.')
