# PDF Group Manager

Монгол хэлтэй, local-first зарчмаар browser дээр ажилладаг PDF бүлгийн менежер. Нэг төслийн PDF бүр тусдаа бүлэг хэвээр үлдэх бөгөөд файлуудыг хооронд нь нэг PDF болгон нийлүүлэхгүй.

Аппыг Vercel-д deploy хийсний дараа компьютер унтарсан үед ч public URL-аар 24/7 нээгдэнэ. `localhost` болон local network IP нь зөвхөн development орчинд ашиглагдана.

## Гол боломжууд

- Анхны төсөлд TSCMP-ORP стандартын нэртэй 21 бүлэг дарааллаар үүснэ.
- Бүлэг үүсгэх, нэрлэх, хувилах, устгах, drag-and-drop-оор эрэмбэлэх боломжтой.
- Бүлэг бүрт тусдаа PDF оруулах, солих, устгах боломжтой.
- Бүлэг бүрийн хамгийн сүүлд үзсэн хуудсыг санана.
- Single-page болон virtualized босоо харагдацтай.
- Virtualized thumbnail, хуудас руу шууд очих, zoom, fit-width, full-screen болон текст хайлттай.
- Project metadata-г JSON-оор export/import хийнэ.
- Project metadata-г `localStorage`, PDF Blob-уудыг `IndexedDB`-д хадгална.
- Light-only, desktop-first responsive дизайнтай.

## Технологи

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4
- PDF.js (`pdfjs-dist`)
- `@tanstack/react-virtual`, `@dnd-kit`, `idb`
- Lucide icons, Sonner toast

## Development

Node.js 20.9 буюу түүнээс дээш хувилбар шаардлагатай. Next.js-ийн дэмждэг modern browser ашиглана: Chrome/Edge 111+, Firefox 111+, Safari 16.4+.

```bash
npm install
npm run dev
```

Дараа нь [http://localhost:3000](http://localhost:3000)-г нээнэ. `localhost` нь public production URL биш.

## Production Build

Commit болон deploy хийхээс өмнө дараах шалгалтуудыг бүгдийг ажиллуулна. Next.js 16-ийн `next build` нь ESLint-ийг автоматаар ажиллуулахгүй тул `lint`-ийг тусад нь ажиллуулах шаардлагатай.

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

`npm start` нь амжилттай үүссэн production build-ийг local Node.js server дээр асаана. Vercel дээр тусдаа `vercel.json` болон custom output directory шаардлагагүй; Next.js-ийн default output-ийг ашиглана.

Одоогийн апп environment variable шаардахгүй. Цаашид secret хэрэгтэй бол source code-д hardcode хийхгүй, local орчинд `.env.local`, Vercel дээр Project Settings → Environment Variables ашиглана. `NEXT_PUBLIC_` угтвартай утга browser bundle-д ил гардагийг анхаарна уу.

## Git Workflow

Өдөр тутмын production workflow:

```text
Visual Studio / Codex
        ↓
Код өөрчлөх, local шалгалт хийх
        ↓
Git commit
        ↓
GitHub push
        ↓
Vercel auto deploy
        ↓
Production website
```

Repository нэг удаа холбогдсоны дараах ердийн командууд:

```bash
git status
git add .
git commit -m "Update PDF Group Manager"
git push
```

Feature өөрчлөлтийг тусдаа branch дээр хийх жишээ:

```bash
git switch -c feature/new-viewer
git add .
git commit -m "Improve PDF viewer"
git push -u origin feature/new-viewer
```

Production build амжилттай болохоос өмнө push хийхгүй. `.env`, `.env.local`, `.vercel`, `.next`, `node_modules` болон log файлуудыг commit хийхгүй.

## GitHub

Repository: [bilguun06/pdf-web](https://github.com/bilguun06/pdf-web). Энэ workspace-ийн default branch нь `main`, `origin` remote нь дээрх HTTPS URL руу тохируулагдсан.

Шинэчлэл бүрт production шалгалтын дараа:

```bash
git add .
git commit -m "Update PDF Group Manager"
git push origin main
```

GitHub authentication асуувал browser sign-in эсвэл GitHub CLI-ийн `gh auth login` ашиглана. Password, token, credential-ийг зохиохгүй, source code эсвэл README-д бичихгүй.

## Vercel Deployment

GitHub push дууссаны дараа:

1. [vercel.com](https://vercel.com)-д нэвтэрч, шаардлагатай бол GitHub account-аар холбоно.
2. **Add New…** → **Project** дарна.
3. **Import Git Repository** хэсэгт GitHub provider-ийг сонгоно.
4. Vercel GitHub authorization асуувал `pdf-web` repository-д access өгнө.
5. `pdf-web` repository-ийн хажуугийн **Import** дарна.
6. **Framework Preset**-ийг `Next.js`, **Root Directory**-г `./` хэвээр үлдээнэ.
7. **Install Command**: `npm install`.
8. **Build Command**: `npm run build`.
9. **Output Directory**-г override хийхгүй, Next.js default утгыг ашиглана.
10. Одоогоор environment variable нэмэх шаардлагагүй.
11. **Deploy** дарна.
12. Deployment амжилттай болсны дараа Vercel-ээс өгсөн бодит `*.vercel.app` URL-ийг ашиглана.

Production branch-ийг Vercel Project → **Settings** → **Environments** → **Production** → **Branch Tracking** хэсэгт `main` байгааг шалгана. `main` руу push хийх бүрд Vercel dependency install, production build, deployment-ийг автоматаар ажиллуулна. Custom domain хэрэгтэй бол дараа нь **Settings** → **Domains** хэсгээс холбоно; source code-д production URL hardcode хийх шаардлагагүй. Дэлгэрэнгүйг Vercel-ийн [Git deployment documentation](https://vercel.com/docs/git)-оос харна уу.

Одоогоор Vercel project холбогдоогүй, production deployment болон public URL үүсээгүй.

## Preview Deployment

GitHub integration идэвхтэй үед `main`-аас өөр branch push хийх эсвэл Pull Request нээх бүрд Vercel тусдаа Preview Deployment үүсгэнэ.

1. `feature/...` branch үүсгэж push хийнэ.
2. GitHub дээр Pull Request нээнэ.
3. Vercel-ийн check дууссаны дараа Pull Request доторх Preview URL-аар өөрчлөлтийг шалгана.
4. Review болон шалгалт амжилттай бол Pull Request-ийг `main` руу merge хийнэ.
5. Merge-ийн дараа Production Deployment автоматаар үүснэ.

Preview болон Production URL нь өөр origin тул browser-ийн `localStorage` болон `IndexedDB` өгөгдлөө хоорондоо хуваалцахгүй.

## Privacy

> Таны PDF файлууд сервер рүү автоматаар илгээгдэхгүй. Файлууд таны browser дээр боловсруулагдана.

- PDF сонгох, parse хийх, render хийх ажиллагаа client-side дээр явагдана.
- Энэ төсөлд PDF upload хийх API route эсвэл server storage байхгүй.
- Project metadata `localStorage`-д, PDF Blob тухайн browser profile-ийн `IndexedDB`-д хадгалагдана.
- Public website ашиглах нь хэрэглэгчийн local PDF-ийг public болгохгүй.
- `localhost`, Vercel Preview, Vercel Production болон custom domain бүр өөр origin учраас тусдаа local storage-тай.
- `*.pdfgroup.json` export-д project metadata орно; PDF Blob өөрөө багтахгүй. Өөр browser/profile дээр import хийсний дараа PDF-ээ дахин сонгож холбоно.
- Browser data цэвэрлэх, private/incognito mode ашиглах, storage permission хаах эсвэл quota дуусах үед local хадгалсан PDF устах боломжтой. Эх PDF файлаа тусад нь найдвартай хадгална уу.

## Project persistence

Тухайн origin болон browser profile дотор refresh хийх, browser-ийг хааж дахин нээхэд project metadata, group order, selected group, PDF filename/Blob, page count, notes болон бүлэг бүрийн хамгийн сүүлд үзсэн хуудас сэргээгдэнэ. Storage quota хүрвэл апп Монгол хэлээр алдаа харуулна.

## Troubleshooting

### Build эсвэл TypeScript алдаа

- `node --version` ажиллуулж Node.js 20.9+ эсэхийг шалгана.
- `npm install`, дараа нь `npm run lint`, `npm run typecheck`, `npm run build`-ийг дарааллаар ажиллуулна.
- Алдааны хамгийн эхний stack trace болон заасан файлыг зассаны дараа build-ийг дахин ажиллуулна.
- Vercel дээр fail болсон бол Project → **Deployments** → тухайн deployment → **Build Logs**-оос local build-тэй ижил алдааг шалгана.

### PDF.js worker алдаа

Апп PDF.js-ийг зөвхөн browser дээр dynamic import хийж, worker-ийг `pdfjs-dist/build/pdf.worker.min.mjs` module asset-аас ачаална. External CDN ашиглахгүй.

2026-08-07-ны local production audit-аар worker нь `/_next/static/media/pdf.worker.min.*.mjs` хэлбэрийн content-hashed asset болж bundle-д орсон бөгөөд `next start` дээр HTTP 200, `application/javascript`, immutable cache header-тай serve болсон.

- Browser DevTools → Network дээр `pdf.worker` request 404 болсон эсэхийг шалгана.
- Vercel-д хамгийн сүүлийн амжилттай commit deploy болсон эсэхийг шалгаад **Redeploy** хийнэ.
- `Failed to load worker`, `Setting up fake worker failed` эсвэл CORS алдаа хэвээр бол deployment Build Logs болон browser console-ийн эхний алдааг хадгалж шалгана.

### IndexedDB эсвэл storage quota

- Private/incognito mode-оос гарч, site storage permission зөвшөөрөгдсөн эсэхийг шалгана.
- Том PDF хадгалахад quota хүрвэл шаардлагагүй site data/PDF-ээ цэвэрлэх эсвэл илүү их сул зайтай browser profile ашиглана.
- Site data-г цэвэрлэх нь local project болон IndexedDB PDF хуулбарыг устгаж болзошгүй. Эх файлаа backup болгон хадгална.

### Refresh-ийн дараа PDF харагдахгүй байх

- Яг ижил protocol, domain, port болон browser profile ашиглаж байгаа эсэхийг шалгана.
- `http://localhost:3000` дээрх өгөгдөл `https://...vercel.app` руу автоматаар шилжихгүй.
- JSON project import нь PDF Blob агуулахгүй тул **PDF дахин сонгох** үйлдлээр холбоно.

### Browser compatibility

- Chrome/Edge 111+, Firefox 111+, Safari 16.4+ хувилбар ашиглана.
- JavaScript, Web Worker, IndexedDB болон local storage хаалтгүй эсэхийг шалгана.
- Password-protected, эвдэрсэн, хоосон эсвэл PDF биш файлд апп Монгол алдааны мэдэгдэл харуулна. Scan зурагтай PDF дээр OCR хийхгүй.

### GitHub эсвэл Vercel authentication

- GitHub push login асуувал Git Credential Manager/browser sign-in эсвэл `gh auth login` ашиглана.
- Vercel GitHub repository харахгүй бол Vercel-ийн **Add New… → Project → Adjust GitHub App Permissions** хэсгээс зөв repository-д access өгнө.
- Secret/token-ийг README, commit эсвэл screenshot-д оруулахгүй.

## Deployment Checklist

Төлөв: 2026-08-07. `[x]` нь энэ workspace дээр баталгаажсан, `[ ]` нь хийгдээгүй эсвэл external account/URL шаардлагатай гэсэн үг.

- [x] `npm install` амжилттай
- [x] `npm run lint` амжилттай
- [x] `npm run build` амжилттай
- [x] TypeScript error байхгүй (`npm run typecheck` амжилттай)
- [x] Production PDF.js worker asset HTTP 200-аар serve болсон
- [x] `npm audit --omit=dev` — 0 vulnerability
- [x] Production source-д `localhost` dependency байхгүй
- [x] Production source-д `192.168.x.x` dependency байхгүй
- [x] PDF drag & drop ажиллаж байгаа
- [x] PDF viewer ажиллаж байгаа
- [x] Group switching ажиллаж байгаа
- [x] Last viewed page ажиллаж байгаа
- [x] IndexedDB ажиллаж байгаа
- [x] Refresh хийсний дараа project сэргээгдэж байгаа
- [x] Git repository зөв
- [x] `main` branch зөв
- [x] GitHub remote зөв — `https://github.com/bilguun06/pdf-web.git`
- [ ] GitHub push амжилттай
- [ ] Vercel project GitHub-тэй холбогдсон
- [ ] Production deployment амжилттай
- [ ] Auto Deploy ажиллаж байгаа
- [ ] Public URL ажиллаж байгаа

Үлдсэн external алхам: commit-ийг GitHub руу push хийх, дараа нь Vercel дээр `pdf-web` repository-г Import хийж Deploy дарах.
