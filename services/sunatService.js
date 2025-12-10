// services/sunatService.js

export async function consultarRucSunat(ruc) {
  try {
    // ------------------------------------------------------------------
    // CONFIGURACIÓN REAL DE DECOLECTA
    // ------------------------------------------------------------------
    const TOKEN = "sk_10943.NTvlbCjteHH5PRdVsMqoD09kEfU6g50o";

    // CORRECCIÓN 1: La URL debe ser /sunat/ruc y llevar el parámetro ?numero=
    const URL = `https://api.decolecta.com/v1/sunat/ruc?numero=${ruc}`;

    const res = await fetch(URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
    });

    if (!res.ok) {
      console.error("Error Decolecta:", res.status);
      return null;
    }

    const data = await res.json();

    // CORRECCIÓN 2: Decolecta devuelve 'razon_social' (con guion bajo)
    if (!data || !data.razon_social) return null;

    return {
      nombres: data.razon_social, // Aquí va la Razón Social
      apellidoPaterno: "",
      apellidoMaterno: "",

      // Datos Fiscales
      direccion: data.direccion || "Sin dirección fiscal",
      estadoContribuyente: data.estado || "ACTIVO",
      condicionContribuyente: data.condicion || "HABIDO",

      // Ubigeo
      ubigeo: data.ubigeo || "",
      departamento: data.departamento || "",
      provincia: data.provincia || "",
      distrito: data.distrito || "",
    };
  } catch (error) {
    console.error("Error servicio SUNAT:", error);
    return null;
  }
}
