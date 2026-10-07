# Roun

Claude Code ve Codex CLI'ı tek pencerede, gerçek terminal içinde çalıştıran masaüstü uygulaması. Yanındaki panelde abonelik limitleri ve açık oturumun bağlam doluluğu görünür.

## Kurulum
- Hazır kurulum dosyası: `dist/Roun-Setup-1.0.0.exe`
- Geliştirme: `npm install`, ardından `npm run dev`
- Yeniden paketleme: `npm run build:win`

Gereken: `claude` ve/veya `codex` komutlarının PATH'te olması (npm global kurulumları yeterli).

## Kısayollar
| Tuş | İşlev |
|---|---|
| Ctrl+Shift+T | Yeni sekme (üst çubuktaki araç/klasör/argümanlarla) |
| Ctrl+Shift+W | Sekmeyi kapat |
| Ctrl+Tab / Alt+1..9 | Sekme değiştir |
| Ctrl+Shift+B | Kenar çubuğunu daralt/genişlet |
| Ctrl+Shift+F | Terminalde ara |
| Ctrl+, | Ayarlar |
| Shift+Enter | Claude/Codex'te yeni satır |
| Ctrl+C | Seçim varsa kopyalar, yoksa iptal sinyali gönderir |
| Ctrl+V | Metni yapıştırır; panoda görsel varsa CLI'ya iletir |

Dosyaları terminale sürükleyip bırakınca yolları yapıştırılır. Ctrl+T, Ctrl+B gibi Claude Code'un kendi kısayolları değiştirilmeden CLI'ya gider.

## Kullanım paneli
- **Claude limitleri**: `~/.claude/.credentials.json` içindeki oturum anahtarıyla Claude Code'un `/usage` ekranının kullandığı uç noktadan okunur (5 saatlik ve haftalık).
- **Codex limitleri**: `~/.codex/auth.json` ile ChatGPT kullanım uç noktasından okunur; okunamazsa son Codex oturum kaydına bakılır.
- **Aktif oturum bağlamı**: sekmenin oturum kaydındaki (`~/.claude/projects/...`, `~/.codex/sessions/...`) son yanıtın token sayısından hesaplanır.

Oturum anahtarları yalnızca kendi sağlayıcılarına (Anthropic / OpenAI) gönderilir, hiçbir yere kaydedilmez. Bu uç noktalar resmi olarak belgelenmemiştir ve ileride değişebilir.
