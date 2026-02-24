# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

## Factory UI notes

### Data sources

- Factory/plant/department/machine info: `public/mock/factory_efficiency_data.json` (loaded by `src/services/mockApi.js`).
- Department layout (customized positions/zones/etc.): stored in MongoDB via the local backend API (`/api/layouts`).

### Run with local MongoDB layout storage

1. Start MongoDB locally (company server or your machine).
2. Create a `.env` file (copy from `.env.example`).
3. Install dependencies: `npm install`
4. Run UI + API: `npm run dev:full`

### User identity

Layouts are stored per `(factoryId, plantId, departmentId, userId)`.

This UI has no authentication yet, so the frontend resolves a `userId` from:
- `window.__FACTORY_UI_USER_ID__` (if the host app injects it), else
- `localStorage.getItem('factory-ui:userId')`.

Once you add login, replace the resolver in `src/services/layoutStorage.js` to use your real logged-in user id.
