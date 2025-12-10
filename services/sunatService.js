export async function consultarRucSunat(ruc) {
  try {
    // Tu Token Real
    const TOKEN = "sk_10943.NTvlbCjteHH5PRdVsMqoD09kEfU6g50o";

    // URL OFICIAL DE RUC (No DNI)
    const URL = `https://api.decolecta.com/v1/sunat/ruc?numero=${ruc}`;

    const res = await fetch(URL, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
    });

    if (!res.ok) return null;

    const data = await res.json();

    // Si no hay razón social, asumimos que no se encontró o hubo error
    if (!data || !data.razon_social) return null;

    return {
      nombres: data.razon_social, // Razón Social
      apellidoPaterno: "",
      apellidoMaterno: "",
      direccion: data.direccion || "-",
      estadoContribuyente: data.estado || "ACTIVO",
      condicionContribuyente: data.condicion || "HABIDO",
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
