# Roun

Claude Code ve Codex CLI'ı tek pencerede, gerçek terminal içinde çalıştıran masaüstü uygulaması. Yanındaki panelde abonelik limitleri ve açık oturumun bağlam doluluğu görünür.

## Kurulum
- Hazır kurulum dosyası: `dist/Roun-Setup-1.2.0.exe`
- Geliştirme: `npm install`, ardından `npm run dev`
- Yeniden paketleme: `npm run build:win`

Gereken: `claude` ve/veya `codex` komutlarının PATH'te olması (npm global kurulumları yeterli).

## OpenRouter (OmniRoute)
**OpenRouter** aracıyla açılan sekme şunları sırayla yapar:
1. `omniroute` sunucusu çalışmıyorsa arka planda başlatılır (çıktısı `%APPDATA%\Roun\omniroute.log`). Roun kapanınca yalnızca kendi başlattığı sunucu kapatılır.
2. Ayarlar → **OpenRouter başlangıcı** alanındaki PowerShell komutları çalışır (ör. `$env:ANTHROPIC_BASE_URL = "http://localhost:20128/v1"`). Bu adresteki port, sunucunun hazır olması beklenirken kullanılır.
3. Aynı oturumda Claude Code başlatılır.

Komutlar `%APPDATA%\Roun\settings.json` içinde düz metin olarak saklanır.

## Kısayollar
| Tuş | İşlev |
|---|---|
| Ctrl+Shift+T | Yeni oturum penceresi (araç, klasör ve parametre seçimi) |
| Ctrl+Shift+W | Sekmeyi kapat |
| Ctrl+Tab / Alt+1..9 | Sekme değiştir |
| Ctrl+Shift+B | Kenar çubuğunu daralt/genişlet |
| Ctrl+Shift+F | Terminalde ara |
| Ctrl+, | Ayarlar |
| Shift+Enter | Claude/Codex'te yeni satır |
| Ctrl+C | Seçim varsa kopyalar, yoksa iptal sinyali gönderir |
| Ctrl+V | Metni yapıştırır; panoda görsel varsa CLI'ya iletir |

Dosyaları terminale sürükleyip bırakınca yolları yapıştırılır. Ctrl+T, Ctrl+B gibi Claude Code'un kendi kısayolları değiştirilmeden CLI'ya gider.

Kenar çubuğundaki **Yeni** düğmesiyle araç, çalışma klasörü ve ek parametreler seçilir; **Oturumu aç** ile terminal başlatılır. Klasör yolu yazılabilir, gözatılarak veya son kullanılanlardan seçilebilir. Ayarlardaki varsayılan parametreler eklenmeye devam eder. Üst çubukta tema ve ayarlar bulunur; oturum arşivi ve sessiz mod kenar çubuğundadır.

## Kullanım paneli
- **Claude limitleri**: `~/.claude/.credentials.json` içindeki oturum anahtarıyla Claude Code'un `/usage` ekranının kullandığı uç noktadan okunur (5 saatlik ve haftalık).
- **Codex limitleri**: `~/.codex/auth.json` ile ChatGPT kullanım uç noktasından okunur; okunamazsa son Codex oturum kaydına bakılır.
- **Aktif oturum bağlamı**: sekmenin oturum kaydındaki (`~/.claude/projects/...`, `~/.codex/sessions/...`) son yanıtın token sayısından hesaplanır.

Oturum anahtarları yalnızca kendi sağlayıcılarına (Anthropic / OpenAI) gönderilir, hiçbir yere kaydedilmez. Bu uç noktalar resmi olarak belgelenmemiştir ve ileride değişebilir.

## Paralel çalışma, arşiv ve uyarılar (1.2)
- **Yan yana**: en az iki açık sekmeyi aynı ekranda gösterir. Sağ panel seçicisinden oturum değiştirilebilir; paneli seçmek etkin sekmeyi ve kullanım bağlamını değiştirir. Gizlenen terminaller çalışmaya devam eder.
- **Worktree ile aç**: seçilen klasörün Git deposunda yeni bir dal ve ayrı çalışma dizini oluşturur veya mevcut worktree’de sekme açar. Yeni dizin HEAD commit’inden başlar; kaydedilmemiş değişiklikler taşınmaz. Roun’un oluşturduğu dizinler kullanıcı verisindeki worktrees klasöründedir ve Roun kapanınca silinmez. Bağımlılık kurulumu ayrıca gerekebilir.
- **Oturum arşivi**: üst çubuktaki saat simgesiyle açılır. Yerel Claude/Codex kayıtları proje, araç ve son değişiklik tarihiyle filtrelenebilir; ad, yol ve son istekte arama yapılır. Oturumlar adlandırılabilir, sabitlenebilir ve sürdürülebilir. En güncel 250 kayıt ve sabitlenenler listelenir; uzun kayıtların başlangıcı ve son bölümü okunur.
- **Görevi devret**: aktif oturumdan veya arşivden düzenlenebilir devir metni hazırlar. Amaç ve son ajan çıktısı kayıttan alınır; kalan görevler düzenlenir. Metin panoya kopyalanıp hedef ajan aynı klasörde açılır. Yeni terminalde Ctrl+V ile yapıştırıp gönderin.
- **Kullanım geçmişi**: ölçümler yerelde usage-history.json içinde tutulur (en fazla 7 gün / 4000 ölçüm). Paneldeki grafik ve geçmiş penceresi son 24 saati gösterir. Hız tahmini için aynı sıfırlanma döneminde en az 3 güncel API ölçümü ve 5 dakikalık geçmiş gerekir. Eski oturum kayıtlarından hız tahmini veya limit bildirimi üretilmez.
- **Uyarılar ve bildirimler**: ayarlardan kullanım/bağlam eşiği (varsayılan %85), masaüstü bildirimleri, sessiz mod ve tekrar bekleme süresi değiştirilebilir. Ajan yanıt beklediğinde, hata verdiğinde veya turu tamamlandığında ilgili sekmeye götüren bildirim gösterilir. Claude’da yalnızca doğrulanmış tamamlanma olayları bildirim üretir; Codex durumu terminal ekranından çıkarılır. Limit sıfırlanma hatırlatması eşiği aşan pencereler için Roun açıkken çalışır. Windows bildirim ayarları bildirimleri engelleyebilir.

## Doğrulama
- npm run typecheck: TypeScript kontrolü.
- npm run test:features: Node.js 22.18+ ile yerel kayıt, kullanım uyarısı ve gerçek Git worktree davranış testleri. Geçici bir test deposu kullanır.
- npm run build:win: Windows kurulum paketini oluşturur.
- Arayüzü gerçek CLI oturumlarını başlatmadan kontrol etmek için önce npm run build, sonra npm run preview:ui; http://127.0.0.1:4318 adresini açın. Bu önizleme yapay veriler kullanır; gerçek bildirim veya sağlayıcı doğrulaması yapmaz.
