// src/main.ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";


import "./assets/tailwind.css";



import { useProfileStore } from "@/stores/profile";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia).use(router);

// inicia perfil
useProfileStore(pinia).init();

app.mount("#app");












