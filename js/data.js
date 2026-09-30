const DATA_URL = "./data/overview.json?v=3";


async function cargarDatos() {

    try {

        const response = await fetch(DATA_URL, {
            cache: "no-store"
        });


        if (!response.ok) {

            throw new Error(
                `Error HTTP: ${response.status}`
            );

        }


        return await response.json();

    } catch (error) {

        console.error(
            "No fue posible cargar los datos:",
            error
        );

        throw error;
    }
}
