// services/reniecService.js
export async function consultarDniReniec(dni) {
  const URL_BASE = process.env.RENIEC_API_URL;
  const TOKEN = process.env.RENIEC_API_TOKEN;

  try {
    const response = await fetch(`${URL_BASE}?numero=${dni}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error API externa: ${response.status}`);
    }

    const data = await response.json();

    // Adaptador para Decolecta (Mapeo Inglés -> Español)
    // A veces viene directo o dentro de 'result'
    const persona = data.result || data;

    // Validación: Si no trae 'first_name', asumimos que no se encontró
    if (!persona || !persona.first_name) return null;

    return {
      nombres: persona.first_name, // ANTES: persona.nombres (ERROR)
      apellidoPaterno: persona.first_last_name, // ANTES: persona.apellidoPaterno
      apellidoMaterno: persona.second_last_name,
      dni: persona.document_number || dni,
      nombreCompleto: persona.full_name,
    };
  } catch (error) {
    console.error("Error consultando RENIEC:", error);
    return null;
  }
}
