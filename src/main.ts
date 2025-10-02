import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";

// Tailwind (asegúrate que existe y tiene @tailwind base/components/utilities)
import "./assets/tailwind.css";

// Pinia
import { createPinia } from "pinia";

// Firebase
import { auth } from "@/services/firebase";
import { onAuthStateChanged } from "firebase/auth";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

const LS_KEY = "redirectAfterLogin";

// Listener GLOBAL: apenas haya usuario, aplica el redirect guardado desde cualquier ruta
let appliedOnce = false;
onAuthStateChanged(auth, async (user) => {
  if (!user || appliedOnce) return;

  const stored = localStorage.getItem(LS_KEY);
  if (!stored) return;

  appliedOnce = true;
  localStorage.removeItem(LS_KEY);

  await router.isReady();
  if (router.currentRoute.value.fullPath !== stored) {
    router.replace(stored).catch(() => {});
  }
});

router.isReady().then(() => app.mount("#app"));
