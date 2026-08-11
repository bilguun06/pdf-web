# PDF Group Manager

Монгол хэлтэй PDF бүлгийн менежер. Нэг төслийн PDF бүр тусдаа бүлэг хэвээр үлдэх бөгөөд файлуудыг хооронд нь нэг PDF болгон нийлүүлэхгүй.

- Production URL: [https://pdf-web-xi.vercel.app](https://pdf-web-xi.vercel.app)
- GitHub repository: [https://github.com/bilguun06/pdf-web](https://github.com/bilguun06/pdf-web)
- Vercel project: `kese111s-projects/pdf-web`

> Дээрх нь одоо байгаа endpoint болон repository-ийн хаяг. Энэ README дэх cloud хувилбар тухайн production deployment-д орсон эсэхийг Vercel Deployments болон доорх шалгах жагсаалтаар тусад нь баталгаажуулна.

## Гол боломжууд

- TSCMP-ORP стандартын нэртэй 21 бүлэгтэй local төсөл үүсгэнэ.
- Бүлэг нэмэх, нэрлэх, хувилах, устгах, drag-and-drop-оор эрэмбэлнэ.
- Бүлэг бүрт нэг PDF оруулах, солих, устгах боломжтой.
- Single-page болон virtualized босоо харагдац, thumbnail, page navigation, zoom, fit-width, fullscreen, текст хайлттай.
- Local project metadata-г JSON файлаар export/import хийнэ.
- Local төслийг хэрэглэгчийн зөвшөөрлөөр cloud төсөл болгон хадгалж, public share link авна.
- Cloud PDF upload-ийн хувийг browser дээр харуулна.
- `/share/[shareId]` нь бүлэг болон PDF-ийг зөвхөн үзэх горимоор харуулна.

## Local ба cloud горим

| Горим | Metadata | PDF | Хэнд харагдах | Төхөөрөмж унтарсан үед |
| --- | --- | --- | --- | --- |
| Local | Тухайн origin-ийн `localStorage` | Тухайн browser profile-ийн `IndexedDB` | Зөвхөн тэр browser/profile | Өөр төхөөрөмжөөс нээгдэхгүй |
| Cloud | Neon Postgres | Vercel Blob | Share link мэддэг хүн үзэж болно | Vercel, Neon, Blob ажиллаж байвал editor төхөөрөмжөөс хамаарахгүй |

Local PDF автоматаар cloud руу илгээгдэхгүй. Зөвхөн хэрэглэгч **Cloud-д хадгалах** үйлдэл хийсний дараа metadata болон PDF upload эхэлнэ. Local хувилбар browser дотроо хэвээр үлдэнэ.

## Архитектур

```text
Browser / Next.js UI
        │
        ├── Local mode ── localStorage + IndexedDB
        │
        └── Cloud API ── Next.js Route Handlers
                ├── Metadata ── Neon Postgres + Drizzle ORM
                └── PDF ────── Vercel Blob (Public store)
```

- Frontend: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- PDF viewer: PDF.js (`pdfjs-dist`) болон `@tanstack/react-virtual`
- Metadata: Neon Postgres, `@neondatabase/serverless`, Drizzle ORM
- PDF storage: Vercel Blob
- Hosting: Vercel

Database нь үндсэн `projects`, `groups`, `pdf_files` хүснэгтүүд болон дотоод `rate_limit_buckets`, `blob_deletion_outbox` хүснэгттэй. `Project → Group` нь one-to-many, `Group → PdfFile` нь zero-or-one холбоостой. Project устахад group/PDF metadata cascade-аар устна. Солигдсон, устсан эсвэл хүчингүй Blob-ийг transaction дотор durable outbox-д бүртгэж, шууд болон дараагийн хүсэлтүүдээр retry хийж цэвэрлэнэ.

## Share URL ба edit URL

Cloud project үүсэхэд хоёр өөр capability URL үүснэ.

### Public share URL

```text
https://your-domain.example/share/p_xxxxxxxxxxxxxxxxxxxxxx
```

- `shareId` нь `p_` + 22 base64url тэмдэгттэй cryptographically random утга.
- Зөвхөн үзэх горим: бүлэг сонгох, PDF үзэх, page navigation, zoom, fullscreen, search ажиллана.
- Бүлэг/PDF нэмэх, солих, устгах, нэрлэх, эрэмбэлэх control харагдахгүй.
- Share response-д project UUID, edit token/hash, Blob pathname ордоггүй.
- Энэ холбоосыг мэддэг хүн төслийг үзэж чадна. Random ID нь нэвтрэх эрхийн системийг орлохгүй.

### Editor URL

```text
https://your-domain.example/project/PROJECT_UUID#token=e_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- `editToken` нь cloud project үүсэхэд нэг удаа raw хэлбэрээр буцна.
- Mutation хүсэлт бүр token-ийг `Authorization: Bearer ...` хэлбэрээр шалгана.
- Database-д raw token биш, `EDIT_TOKEN_PEPPER` ашигласан HMAC-SHA256 hash хадгалагдана.
- Editor token нь URL fragment (`#token=`)-ээр browser-д очих тул HTTP request, hosting access log, Next.js HTML/router payload-д дамжихгүй. Client үүнийг project ID-аар тусгаарласан `localStorage` key-д хадгалж, амжилттай хадгалсны дараа address bar-аас арилгана. Иймээс edit access browser restart-ийн дараа үргэлжилнэ; browser data цэвэрлэхэд алдагдана. Editor URL нь capability secret агуулдаг тул bookmark, sync, screenshot болон clipboard-д үлдэж болохыг анхаарна.
- `/project/*` response нь `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow` header ашиглана. Хуучин хувилбараас үлдсэн `?token=` холбоосыг private/no-store redirect-ээр fragment хэлбэрт шилжүүлдэг; шинэ холбоос query token огт ашиглахгүй.
- Public share URL-д edit token хэзээ ч бүү нэм.

> **Editor link нь password-той адил.** Нууц password manager эсвэл зөвхөн өөрийн bookmark-д хадгал. Chat, email group, issue, log, screenshot, source code, README-д бүү нийтэл.

### Edit token алдвал

Эхний хувилбар login/account recovery-гүй. Сервер raw token-ийг хадгалдаггүй тул editor URL/token-ийг алдсан үед хуучин cloud төслийн засварлах эрхийг сэргээх боломжгүй.

- Local төсөл browser-т үлдсэн бол түүнийг шинэ cloud project болгон дахин хадгалж, шинэ editor URL авна.
- Local хувь байхгүй бол public share link-ээр зөвхөн үзэх боломжтой; edit access сэргээх боломжгүй.
- `EDIT_TOKEN_PEPPER`-ийг сольбол өмнө үүссэн бүх editor token шалгалтгүй болно. Нэг environment-д анх тохируулсан pepper-ээ тогтвортой хадгал.

## Privacy ба аюулгүй байдал

### Local mode

- PDF parse/render browser дээр явагдана.
- Metadata `localStorage`, PDF Blob `IndexedDB`-д хадгалагдана.
- `localhost`, Preview, Production, custom domain бүр өөр origin тул local data хоорондоо автоматаар шилжихгүй.
- Browser data цэвэрлэх, private/incognito mode, quota эсвэл storage permission-ийн асуудлаар local PDF алдагдаж болно.
- `*.pdfgroup.json` export нь metadata агуулна; PDF Blob агуулахгүй.

### Cloud mode

- **Cloud-д хадгалах** нь PDF-ийг Vercel Blob, metadata-г Neon Postgres руу зориуд илгээнэ.
- Share viewer PDF.js-д direct URL/range read ашигладаг тул Blob store заавал **Public** байна.
- Public Blob файл нь URL-ийг мэддэг хүнд шууд уншигдана. Share хийсэн PDF-ийг confidential/private storage гэж үзэж болохгүй.
- `shareId` болон Blob pathname random боловч холбоос forward хийх, browser DevTools/Network, log эсвэл screenshot-оор задрах боломжтой.
- `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `EDIT_TOKEN_PEPPER`, `CRON_SECRET` нь server-only. Аль нэгийг `NEXT_PUBLIC_` угтвартай болгож болохгүй.
- Upload token үүсгэхээс өмнө project edit token, origin, project/group ID болон client-ийн зарласан PDF byte хэмжээ шалгагдана. Token-ийн `maximumSizeInBytes` нь зарласан хэмжээтэй яг тэнцүү. Upload дууссаны дараа trusted Blob metadata-ийн бодит хэмжээ signed token payload дахь зарласан хэмжээтэй таарч байгаа эсэх, MIME type болон `%PDF-` magic bytes-ийг сервер талд дахин шалгана; зөрүүтэй Blob durable deletion outbox-оор цэвэрлэгдэнэ. Нэг PDF `1,500 MiB`, нэг project-ийн active PDF нийлбэр `10 GiB`-ээс хэтрэхгүй.
- Project create нь IP тутамд 5/цаг rate limit-тэй. Blob upload token нь project тутамд 60/цаг, IP тутамд 120/цаг; зарласан upload хэмжээ IP тутамд 20 GiB/цаг, deployment даяар 100 GiB/цаг DB-backed budget-тэй. Byte budget нь token үүсэх үед MiB рүү дээш бүхэлчилж reserve хийгддэг тул тасалдсан/ашиглаагүй token ч тухайн нэг цагийн цонх дуустал тооцогдоно. Хязгаар хэтэрвэл `429` болон `Retry-After` буцна. IP-ийн raw утга database-д хадгалагдахгүй, Vercel-ийн trusted `x-forwarded-for` утгыг HMAC hash болгож bucket-д оруулна.
- Create retry нь UUIDv4 `Idempotency-Key` ашигладаг. Ижил хүсэлт response тасарсны дараа давтагдвал ижил project/edit token буцаж, өөр payload-тай давхцвал `409` буцна. Group sync тогтвортой client ID ашиглан duplicate үүсэхээс хамгаална.
- Upload token бүр group-ийн generation-ийг ахиулна. PDF устгах эсвэл шинэ upload эхлэхэд хуучин callback metadata-г дахин сэргээж чадахгүй.

Highly confidential PDF-д public Blob загвар тохирохгүй. Тийм шаардлагатай бол private Blob + authenticated download proxy + хэрэглэгчийн login/authorization-ийг тусдаа хувилбараар хийх шаардлагатай.

## Шаардлага

- Node.js 20.9 буюу түүнээс дээш
- npm
- Neon Postgres database
- Vercel Blob Public store
- Vercel project эсвэл local development орчин

## Environment variables

`.env.example` дэх cloud production-д шаардлагатай дөрвөн утга бүгд server-only. Local app болон ердийн API-д эхний гурав, production cleanup schedule-д `CRON_SECRET` хэрэглэгдэнэ.

| Variable | Зориулалт |
| --- | --- |
| `DATABASE_URL` | App runtime-ийн Neon Postgres connection string; production/serverless орчинд pooled URL ашиглаж болно |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob upload, metadata check, delete хийх read/write secret |
| `EDIT_TOKEN_PEPPER` | Edit token-ийг HMAC hash болгох тогтвортой, хамгийн багадаа 32 тэмдэгттэй secret |
| `CRON_SECRET` | Blob cleanup cron endpoint-ийг хамгаалах, хамгийн багадаа 16 тэмдэгттэй random bearer secret |

Local файл үүсгэх:

```powershell
Copy-Item .env.example .env.local
```

эсвэл Bash:

```bash
cp .env.example .env.local
```

Pepper үүсгэх нэг арга:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Гарсан утгыг `EDIT_TOKEN_PEPPER` болгон `.env.local` болон Vercel Environment Variables-д оруулна. `CRON_SECRET`-ийг доорх cron setup-ийн дагуу тусдаа random утгаар үүсгэнэ. Placeholder эсвэл бодит secret-ийг commit хийхгүй.

### Migration-д direct connection

App runtime-д pooled `DATABASE_URL` тохиромжтой. Schema migration-д Neon-ийн direct/unpooled connection ашиглана.

`drizzle.config.ts` дараах дарааллаар URL сонгодог:

1. `DATABASE_URL_UNPOOLED`
2. `POSTGRES_URL_NON_POOLING`
3. `DATABASE_URL`

Эхний хоёр нь integration-аас ирж болох optional migration variable бөгөөд application-ийн үндсэн дөрвөн variable-д орохгүй. Байхгүй бол migration ажиллуулах үед `DATABASE_URL`-д Neon Console-ийн direct connection string-ийг түр ашиглаад, app runtime-д pooled URL-ээ буцааж тохируулна.

## Neon database setup

### Vercel Marketplace ашиглах — санал болгож буй зам

1. Vercel Dashboard дээр `pdf-web` project-ийг нээнэ.
2. **Storage** эсвэл [Vercel Marketplace → Neon](https://vercel.com/marketplace/neon) руу орно.
3. **Install** / **Create Database** дарж Neon-ийг сонгоно.
4. Шинэ Neon account/database үүсгэх бол **Create New Neon Account**, байгаа Neon account-аа холбох бол **Link Existing Neon Account** сонгоно.
5. Database name, region, plan-аа сонгоод `pdf-web` project болон шаардлагатай Production/Preview/Development environment-үүдтэй холбоно.
6. Vercel Project → **Settings → Environment Variables** дээр `DATABASE_URL` орсныг шалгана.
7. Migration-д direct URL хэрэгтэй тул `DATABASE_URL_UNPOOLED` байгаа эсэхийг шалгах эсвэл Neon Console → **Connect**-оос direct connection string авна.

Marketplace integration credentials-ийг project environment variable болгон автоматаар холбоно. Албан ёсны тайлбар: [Vercel Marketplace Storage](https://vercel.com/docs/marketplace-storage), [Neon for Vercel](https://vercel.com/marketplace/neon).

### Neon-ийг гараар холбох

1. Neon Console-д project/database үүсгэнэ.
2. **Connect** хэсгээс pooled болон direct connection string-үүдийг авна.
3. Vercel Project → **Settings → Environment Variables** дээр pooled утгыг `DATABASE_URL` болгон оруулна.
4. Direct утгыг migration хийх trusted local/CI орчинд `DATABASE_URL_UNPOOLED` болгон ашиглана.
5. Local development-д ижил утгуудыг `.env.local`-д хадгална.

Дэлгэрэнгүй: [Neon — Connect Vercel manually](https://neon.com/docs/guides/vercel-manual), [Neon + Drizzle](https://neon.com/docs/guides/drizzle).

## Database migration

Migration-ийг production code deploy хийхээс **өмнө**, зөв database/branch болон direct URL сонгосноо шалгаад ажиллуулна.

```bash
npm install
npm run db:check
npm run db:migrate
```

- `npm run db:migrate` нь Drizzle migration-уудыг database-д хэрэглэнэ.
- Migration-ийг production-тэй ижил өгөгдөлтэй Neon branch дээр эхлээд турших нь зөв.
- `npm run build` database schema үүсгэхгүй; migration нь тусдаа operational алхам.
- Preview database/branch ашиглавал production share project-ууд Preview орчинд автоматаар байхгүй.

## Vercel Blob setup

Public share viewer direct PDF URL ашигладаг тул **Public store** сонгох ёстой. Store-ийн access mode-ийг үүсгэсний дараа сольж болохгүй тул энэ сонголтыг эхэнд нь зөв хийнэ.

1. Vercel Dashboard → `pdf-web` → **Storage**.
2. **Create Database** → **Blob** → **Continue**.
3. Access-ийг **Public** сонгоод store үүсгэнэ.
4. Store-ийг `pdf-web` project-ийн Production/Preview/Development environment-үүдтэй холбоно.
5. Project → **Settings → Environment Variables** дээр `BLOB_READ_WRITE_TOKEN` автоматаар нэмэгдсэнийг шалгана.
6. Local development-д token-ийг `.env.local` руу аюулгүй хуулна, эсвэл linked project дээр `npx vercel env pull .env.local` ашиглана.

Шинэ upload бүр `pdfs/<random-uuid>-<random-suffix>.pdf` гэсэн opaque pathname ашиглана. Internal project/group UUID нь public Blob URL-д орохгүй; authorization context зөвхөн signed upload metadata-д дамжина.

Албан ёсны тайлбар: [Vercel Blob Public Storage](https://vercel.com/docs/vercel-blob/public-storage), [Client Uploads](https://vercel.com/docs/vercel-blob/client-upload).

## Blob cleanup cron

Устсан эсвэл солигдсон PDF-ийн Blob pathname эхлээд durable `blob_deletion_outbox` хүснэгтэд орно. Ердийн cloud API хүсэлтүүд бага хэмжээгээр opportunistic cleanup хийсээр байна. Үүнээс гадна `vercel.json` нь `/api/cron/blob-cleanup` endpoint-ийг өдөр бүр `18:17 UTC`-д дуудах production cron бүртгэнэ. Hobby plan дээр cron өдөрт нэг удаа ажиллах хязгаартай бөгөөд тухайн цагийн дотор хэлбэлзэж болно.

Cron нэг invocation-д хугацаа/тоо хязгаартайгаар due delete-үүдийг боловсруулна. Амжилттай completed болсон tombstone-ийг late callback race-аас хамгаалахын тулд 30 хоног хадгалж, түүнээс хуучин бөгөөд ямар ч active PDF metadata-д ашиглагдаагүй мөрийг хамгийн ихдээ 1,000-аар purge хийнэ. Pending, deferred, failed буюу `completed_at`-гүй мөр purge-д хэзээ ч орохгүй. Blob pathname нь UUID/random suffix-тэй, дахин ашиглагддаггүй.

1. Дор хаяж 16 тэмдэгттэй random secret үүсгэнэ:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

2. Vercel Project → **Settings → Environment Variables** дээр `CRON_SECRET` нэрээр **Production** environment-д нэмнэ.
3. Production deployment-ийг redeploy хийнэ. Vercel cron хүсэлт бүрт `Authorization: Bearer <CRON_SECRET>` header-ийг автоматаар нэмдэг; endpoint нь fixed-length SHA-256 digest-үүдийг constant-time compare хийж байж outbox drain эхлүүлнэ.
4. Vercel Project → **Settings → Cron Jobs** дээр job идэвхтэй, `/api/cron/blob-cleanup` замтай болсныг шалгана. Үр дүнг Cron Jobs-ийн **View Logs**-оос хянана.

Endpoint зөвхөн `GET` handler-тэй, authorization буруу эсвэл `CRON_SECRET` тохируулаагүй үед `401` буцаана. Secret-ийг URL/query, source code, log эсвэл client-side environment-д бүү оруул. Vercel cron нь зөвхөн production deployment-ийг дууддаг.

Нэг Blob delete амжилтгүй бол attempt count болон дараагийн retry хугацаа outbox-д хадгалагдана. Vercel өөрөө бүтэн cron invocation алдахад шууд retry хийдэггүй ч durable row устахгүй: дараагийн ердийн cloud API хүсэлт эсвэл дараагийн өдрийн cron дахин оролдоно.

Албан ёсны тайлбар: [Vercel Cron quickstart](https://vercel.com/docs/cron-jobs/quickstart), [Cron security and management](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Cron usage and Hobby limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Local development

```bash
npm install
```

1. `.env.example`-ийг `.env.local` болгон хуулж бодит server-only утгуудаа оруулна.
2. Direct Neon URL ашиглан migration хийнэ:

   ```bash
   npm run db:migrate
   ```

3. Development server асаана:

   ```bash
   npm run dev
   ```

4. [http://localhost:3000](http://localhost:3000)-г нээнэ.

### Local Blob callback

Client upload дууссаны дараах Blob callback нь PDF metadata-г database-д баталгаажуулж хадгалдаг. Vercel Blob нь `localhost` руу callback хийх боломжгүй.

Cloud upload-ийн бүрэн callback flow-г local дээр турших бол public HTTPS tunnel ашиглаж:

```dotenv
VERCEL_BLOB_CALLBACK_URL=https://YOUR-TUNNEL.example
```

гэж `.env.local`-д түр тохируулна. Жишээ нь ngrok ашиглаж болно. Энэ нь production-д заавал шаардлагатай тав дахь application secret биш; зөвхөн local callback testing helper юм. Production/Preview дээр Vercel system URL-ууд callback address-ийг автоматаар тогтооно.

## Cloud save ба upload progress

Local төслийг cloud-д хадгалах үед:

1. Project болон group metadata Postgres-д үүснэ.
2. Server raw edit token-ийг нэг удаа өгч editor/share URL үүсгэнэ.
3. Browser PDF бүрийн page count болон client-side validation-ийг хийдэг.
4. Browser edit token-оор богино настай Blob upload token авна.
5. PDF browser-оос Vercel Blob руу шууд upload хийгдэнэ; app server-ээр бүтэн файл дамжихгүй.
6. `onUploadProgress`-оор `0–100%` progress UI шинэчлэгдэнэ.
7. `100 MiB`-ээс том PDF multipart upload ашиглаж, хэсгүүдийг зэрэг илгээж/дахин оролдох боломжтой болгоно.
8. Blob completion callback MIME, хэмжээ, pathname, Blob host болон `%PDF-` magic bytes-ийг шалгасны дараа URL/page count/file size-г Postgres-д хадгална.

Upload progress `100%` болсон ч callback validation/database write дуусахад богино хугацаа шаардагдаж болно. **PDF амжилттай хадгалагдлаа** гэсэн эцсийн төлөв гарах хүртэл tab-аа хаахгүй байна.

App-ийн token endpoint нэг PDF-д хамгийн ихдээ `1,500 MiB`, нэг cloud project-д нийлбэр `10 GiB`, хамгийн ихдээ `500` бүлэг зөвшөөрнө. Зөвхөн `application/pdf` upload зөвшөөрөгдөнө. Vercel plan/storage-ийн бодит limit үүнээс бага байж болох тул provider-ийн plan limit-ийг мөн шалгана.

## QA болон production build

Next.js build нь ESLint-ийг автоматаар ажиллуулахгүй. Commit/deploy хийхээс өмнө:

```bash
npm run lint
npm run typecheck
npm run build
```

Амжилттай build үүссэний дараа local production server шалгах бол:

```bash
npm start
```

Энэ хэсэг нь ажиллуулах командуудыг заасан бөгөөд одоогийн commit/deployment амжилттай гэсэн баталгаа биш.

## Vercel deployment

Repository аль хэдийн дараах хаягуудтай:

- GitHub: [bilguun06/pdf-web](https://github.com/bilguun06/pdf-web)
- Production endpoint: [https://pdf-web-xi.vercel.app](https://pdf-web-xi.vercel.app)

Cloud хувилбарыг deploy хийх дараалал:

1. `pdf-web` Vercel project-д Neon database болон **Public** Blob store холбоно.
2. Production/Preview/Development scope бүрт шаардлагатай `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `EDIT_TOKEN_PEPPER` байгаа эсэхийг шалгаж, Production scope-д `CRON_SECRET` нэмнэ.
3. Production migration-д `DATABASE_URL_UNPOOLED` эсвэл өөр direct Neon URL бэлтгэнэ.
4. Production database backup/branch-аа шалгаад `npm run db:migrate` ажиллуулна.
5. `npm run lint`, `npm run typecheck`, `npm run build` ажиллуулж үр дүнг баталгаажуулна.
6. Code-оо `main` руу push хийнэ. Одоогийн GitHub integration хэвээр бол Vercel шинэ deployment эхлүүлнэ.
7. Environment variable шинээр нэмсэн/солисон бол тухайн deployment-ийг **Redeploy** хийнэ.
8. Deploy Logs, Function Logs, browser Network/Console-оор доорх checklist-ийг шалгана.

Build command: `npm run build`. Output Directory-г override хийхгүй; Next.js default output ашиглана. Database migration-ийг build command-д автоматаар хавсаргахгүй.

## Deployment verification checklist

Доорх нь operator-ийн шалгах жагсаалт; одоогийн төлөвийг урьдчилан claim хийгээгүй.

- [ ] `npm install` амжилттай
- [ ] `npm run lint` амжилттай
- [ ] `npm run typecheck` амжилттай
- [ ] `npm run build` амжилттай
- [ ] Production Neon resource project-т холбогдсон
- [ ] Production Blob store **Public** бөгөөд project-т холбогдсон
- [ ] Production environment-д дөрвөн required server-only variable байна
- [ ] `EDIT_TOKEN_PEPPER` тогтвортой, 32+ тэмдэгттэй
- [ ] `CRON_SECRET` random, 16+ тэмдэгттэй бөгөөд `/api/cron/blob-cleanup` cron идэвхтэй
- [ ] Direct URL-аар `npm run db:migrate` амжилттай
- [ ] Local project өмнөх шигээ refresh-ийн дараа сэргээгдэж байна
- [ ] Cloud project үүсгэж editor URL авсан
- [ ] PDF upload progress харагдаж, callback-ийн дараа metadata хадгалагдсан
- [ ] Өөр browser/device дээр `/share/p_...` нээгдсэн
- [ ] Share page дээр edit/add/delete/upload control байхгүй
- [ ] Invalid share ID clean not-found UI харуулсан
- [ ] Editor mutation буруу/дутуу token-той үед `401` буцаасан
- [ ] Public share response edit token/hash болон Blob pathname агуулаагүй
- [ ] Production URL-ийн хамгийн сүүлийн deployment `READY`

## Git workflow

```bash
git status
git add .
git commit -m "Add cloud PDF sharing"
git push origin main
```

Feature branch ашиглах бол:

```bash
git switch -c feature/cloud-sharing
git push -u origin feature/cloud-sharing
```

`.env`, `.env.local`, `.vercel`, `.next`, `node_modules`, log, database dump болон credential файлуудыг commit хийхгүй.

## Troubleshooting

### `DATABASE_URL environment variable тохируулаагүй`

- `.env.local` UTF-8 plain text бөгөөд variable name зөв эсэхийг шалгана.
- Vercel Project → **Settings → Environment Variables** дээр зөв environment scope сонгосон эсэхийг шалгана.
- Variable нэмсний дараа dev server-ээ restart, Vercel deployment-ээ redeploy хийнэ.

### `relation ... does not exist`

- App-тай ижил database/branch руу migration хийсэн эсэхийг шалгана.
- Direct/unpooled URL ашиглан `npm run db:migrate` дахин ажиллуулна.
- Production database-д ad-hoc SQL хийхийн оронд committed Drizzle migration ашиглана.

### Cloud upload local дээр 100% болоод хадгалагдахгүй

- `BLOB_READ_WRITE_TOKEN` зөв Public store-ийнх эсэхийг шалгана.
- `onUploadCompleted` localhost руу шууд callback хийж чаддаггүй. Public HTTPS tunnel болон `VERCEL_BLOB_CALLBACK_URL` ашиглана.
- Vercel Blob callback/Function log дахь request ID болон эхний алдааг шалгана.

### Shared PDF нээгдэхгүй

- Blob store **Public** эсэхийг шалгана; private store-ийн URL-г PDF.js шууд уншихгүй.
- Blob Dashboard-аас тухайн URL/pathname байгаа эсэхийг шалгана.
- Browser Network дээр Blob request-ийн status, CORS, range response-ийг шалгана.

### Editor API `401`

- `/project/[uuid]#token=e_...` editor URL бүрэн эсэхийг шалгана.
- Public `/share/...` URL нь edit эрх өгөхгүй.
- `EDIT_TOKEN_PEPPER` өөрчлөгдсөн бол хуучин token сэргээгдэхгүй; өмнөх pepper-ийг restore хийх эсвэл local төслөөс шинэ cloud project үүсгэнэ.

### Share link `404`

- URL `/share/p_` + 22 base64url тэмдэгттэй бүтэн эсэхийг шалгана.
- Project устсан эсвэл өөр environment/database-ийн share ID эсэхийг шалгана.
- Preview болон Production тусдаа Neon branch ашиглаж байвал нэг орчны share ID нөгөөд байхгүй байж болно.

## Албан ёсны баримт бичиг

- [Vercel Marketplace Storage](https://vercel.com/docs/marketplace-storage)
- [Neon for Vercel](https://vercel.com/marketplace/neon)
- [Neon manual Vercel connection](https://neon.com/docs/guides/vercel-manual)
- [Neon Drizzle guide](https://neon.com/docs/guides/drizzle)
- [Vercel Blob Public Storage](https://vercel.com/docs/vercel-blob/public-storage)
- [Vercel Blob Client Uploads](https://vercel.com/docs/vercel-blob/client-upload)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel Cron security and management](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
