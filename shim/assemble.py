import re
h=open('/home/claude/build/dist/index.html',encoding='utf-8').read()
sm=re.search(r'<style rel="stylesheet"[^>]*>',h); cs=sm.end(); ce=h.index('</style>',cs); css=h[cs:ce]
jm=re.search(r'<script type="module"[^>]*>',h); js=h[jm.end():h.index('</script>',jm.end())]
js=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',lambda m:'\\x%02x'%ord(m.group(0)),js)
assert '</script' not in js.lower()
out='<title>Gestão de Frotas</title>\n<style id="gm-style">\n'+css+'\n</style>\n<div id="root"></div>\n<script type="module" id="gm-app">'+js+'</script>\n'
open('/home/claude/build/artifact.html','w',encoding='utf-8').write(out)
open('/home/claude/build/test.html','w',encoding='utf-8').write('<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px -apple-system,sans-serif}</style></head><body>'+out+'</body></html>')
print(len(out)/1e6,'MB')
