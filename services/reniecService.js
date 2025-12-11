// services/reniecService.js
export async function consultarDniReniec(dni) {
  try {
    // Usar el mismo token y proveedor que SUNAT
    const TOKEN = "sk_10943.NTvlbCjteHH5PRdVsMqoD09kEfU6g50o";
    const URL = `https://api.decolecta.com/v1/reniec/dni?numero=${dni}`;

    const response = await fetch(URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Error API RENIEC: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    console.log("📊 Respuesta RENIEC completa:", JSON.stringify(data, null, 2));

    // Adaptador para Decolecta (Mapeo Inglés -> Español)
    // A veces viene directo o dentro de 'result'
    const persona = data.result || data;

    console.log("👤 Datos de persona extraídos:", JSON.stringify(persona, null, 2));

    // Validación: Si no trae 'first_name', asumimos que no se encontró
    if (!persona || !persona.first_name) {
      console.error("❌ No se encontró first_name en la respuesta");
      return null;
    }

    const resultado = {
      nombres: persona.first_name || "",
      apellidoPaterno: persona.first_last_name || "",
      apellidoMaterno: persona.second_last_name || "",
      dni: persona.document_number || dni,
      nombreCompleto: persona.full_name || "",
      direccion: "-", // Agregar campo direccion que falta
    };
    
    console.log("✅ Resultado final RENIEC:", JSON.stringify(resultado, null, 2));
    
    return resultado;
  } catch (error) {
    console.error("❌ Error consultando RENIEC:", error);
    return null;
  }
}
