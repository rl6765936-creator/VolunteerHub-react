# VolunteerHub

מערכת להתנדבות קהילתית: משתמשים מפרסמים בקשות עזרה, מנהל מאשר או דוחה אותן, ומתנדבים מציעים עזרה. בעל הבקשה בוחר מתנדב אחד ומסמן את הבקשה כהושלמה.

A community volunteering app: users post help requests, an admin moderates them, volunteers offer help, and the request owner accepts one offer and completes the request.

## מבנה הריפוזיטורי

| תיקייה | תוכן |
| --- | --- |
| [`volunteerhub-backend/`](volunteerhub-backend) | שרת: Node.js 22, Express 5, TypeScript, Prisma, PostgreSQL, JWT, Zod, Vitest |
| [`volunteerhub-frontend/`](volunteerhub-frontend) | לקוח: React 19, TypeScript, Vite, React Router, React Hook Form + Yup, TanStack React Query, Context API |

## מה יש במערכת

- הרשמה והתחברות עם JWT, ושני תפקידים: משתמש רגיל ומנהל (`ADMIN`), עם הרשאות שונות.
- אובייקט מרכזי: בקשת עזרה. השדות שלה הם כותרת, תיאור, קטגוריה, אזור, כתובת, תאריך יעד ותמונות. יש לה סטטוס (`OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`) וגם סטטוס אישור (`PENDING_REVIEW`, `APPROVED`, `REJECTED`).
- רשימת בקשות עם סינון לפי סטטוס ועם עימוד. אפשר להוסיף בקשה ולערוך אותה.
- "הבקשות שלי", הצעות עזרה ובחירת מתנדב.
- מסך מנהל לאישור ולדחייה של בקשות, עם סיבת דחייה.
- כל הנתונים מגיעים מהשרת ונשמרים במסד PostgreSQL.

## הרצה מקומית

דרישות: Node.js 22 ו-PostgreSQL.

### שרת

```bash
cd volunteerhub-backend
cp .env.example .env      # ממלאים ערכים אמיתיים, הקובץ לא נשמר בגיט
npm install
npm run db:deploy         # מריץ את המיגרציות
npm run db:seed           # יוצר את קטגוריות ברירת המחדל ואת חשבון המנהל הראשון
npm run dev               # http://localhost:3001/api
```

תיעוד ה-API (Swagger) נמצא בכתובת `http://localhost:3001/api/docs`. פרטים נוספים יש ב-[README של השרת](volunteerhub-backend/README.md).

### לקוח

```bash
cd volunteerhub-frontend
echo "VITE_API_URL=http://localhost:3001/api" > .env
npm install
npm run dev               # http://localhost:5173
```

## פריסה לענן (Render)

1. **מסד נתונים:** יוצרים PostgreSQL ב-Render ומעתיקים את ה-Internal Database URL.
2. **שרת:** יוצרים Web Service עם Root Directory `volunteerhub-backend`.
   - Build: `npm install && npm run build && npm run db:deploy`
   - Start: `npm start`
   - משתני סביבה: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (לפחות 32 תווים), `CORS_ORIGINS` (כתובת הלקוח), `TRUST_PROXY=1`
3. **לקוח:** יוצרים Static Site עם Root Directory `volunteerhub-frontend`.
   - Build: `npm install && npm run build`
   - Publish directory: `dist`
   - משתנה סביבה: `VITE_API_URL=https://<כתובת-השרת>/api`
   - Rewrite rule: `/*` אל `/index.html`, כדי שהניתוב של React Router יעבוד.

## אבטחה

קובצי `.env`, `node_modules`, קבצים שהועלו וגיבויי מסד נתונים לא נכנסים לריפוזיטורי (ראו את קובצי `.gitignore`). בקובץ `.env.example` יש רק ערכים לדוגמה.
