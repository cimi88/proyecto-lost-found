from __future__ import annotations

from app.agent import build_system_prompt


def normalized(prompt: str) -> str:
    return " ".join(prompt.lower().split())


def test_prompt_contains_real_navigation_and_screen_boundaries() -> None:
    prompt = normalized(build_system_prompt("USER"))

    assert "/publications" in prompt
    assert "/my-publications" in prompt
    assert "/publications/:id" in prompt
    assert "/my-publications/:id" in prompt
    assert "/admin/publications" in prompt
    assert "/recovery-requests" in prompt
    assert "/recovery-requests/received" in prompt
    assert "mis publicaciones" in prompt
    assert "es una pantalla independiente, no un filtro de buscar" in prompt
    assert "no permite editar ni eliminar" in prompt
    assert "no muestra coincidencias" in prompt
    assert "permite iniciar una solicitud de recuperación" in prompt


def test_prompt_distinguishes_publication_actions_and_states() -> None:
    prompt = normalized(build_system_prompt("USER"))

    assert "tipos reales: lost (perdido) y found (encontrado)" in prompt
    for status in ("active", "reserved", "returned", "closed"):
        assert f"{status} (" in prompt
    assert "no existen resolved" in prompt
    assert "no existen" in prompt and "in_recovery" in prompt
    assert "editar: solo publicaciones propias en estado active" in prompt
    assert "cerrar: acción de cierre lógico" in prompt
    assert "no elimina el registro" in prompt
    assert "eliminar: no existe eliminación de publicaciones" in prompt
    assert "cambio libre de estado: no existe" in prompt
    assert "marcar directamente una publicación lost como recuperada: no existe" in prompt


def test_prompt_explains_matching_scope_and_limitations() -> None:
    prompt = normalized(build_system_prompt("USER"))

    assert "son sugerencias automáticas, no una búsqueda manual" in prompt
    assert "se generan al crear o editar publicaciones" in prompt
    assert "se consultan al abrir el detalle público" in prompt
    assert "se muestran en /publications/:id, no en /my-publications/:id" in prompt
    assert "no confirman que dos publicaciones correspondan al mismo objeto" in prompt


def test_prompt_separates_recovery_request_states_and_effects() -> None:
    prompt = normalized(build_system_prompt("USER"))

    for status in ("pending", "approved", "rejected", "cancelled", "completed"):
        assert f"{status} (" in prompt
    assert "los estados de una solicitud son distintos" in prompt
    assert "pending a approved" in prompt
    assert "la publicación pasa a reserved" in prompt
    assert "pending a rejected" in prompt
    assert "no cambia el estado de la publicación" in prompt
    assert "approved a completed" in prompt
    assert "la publicación found pasa a returned" in prompt
    assert "approved a cancelled" in prompt
    assert "requiere un motivo" in prompt
    assert "la publicación vuelve a active" in prompt
    assert "cancelar una solicitud no equivale a recuperar un objeto" in prompt
    assert "aprobar, rechazar, cancelar una reserva o registrar la devolución" in prompt


def test_prompt_describes_limited_administration_without_old_claims() -> None:
    prompt = normalized(build_system_prompt("ADMIN"))

    assert "existe una pantalla de moderación" in prompt
    assert "/admin/publications" in prompt
    assert "publicaciones activas de otros usuarios" in prompt
    assert "permite cerrarlas" in prompt
    assert "no existe un panel global completo" in prompt
    assert "gestión de usuarios" in prompt
    assert "el asistente no puede ejecutar acciones de moderación" in prompt

    for outdated in (
        "no existe panel administrativo",
        "no hay panel administrativo",
        "no existe moderación",
        "admin usa las mismas pantallas que user",
    ):
        assert outdated not in prompt


def test_user_and_admin_roles_receive_different_moderation_guidance() -> None:
    user_prompt = normalized(build_system_prompt("USER"))
    admin_prompt = normalized(build_system_prompt("ADMIN"))

    assert "no tiene acceso a la pantalla de moderación" in user_prompt
    assert "puede acceder a la moderación administrativa" in admin_prompt
    assert "el rol admin no otorga al asistente herramientas" in admin_prompt


def test_prompt_limits_assistant_to_the_three_preparation_actions() -> None:
    prompt = normalized(build_system_prompt("USER"))

    assert "preparar publicaciones de objetos perdidos" in prompt
    assert "preparar publicaciones de objetos encontrados" in prompt
    assert "preparar solicitudes de recuperación" in prompt
    assert "esperar la confirmación explícita" in prompt
    assert "fastapi ejecuta la operación después de pulsar confirmar" in prompt
    assert "el modelo no ejecuta directamente las operaciones" in prompt


def test_prompt_lists_assistant_read_and_management_limitations() -> None:
    prompt = normalized(build_system_prompt("USER"))

    for limitation in (
        "buscar publicaciones reales",
        "consultar detalles, estados o listados de publicaciones",
        "consultar coincidencias",
        "listar las publicaciones de un usuario",
        "consultar solicitudes propias o recibidas",
        "editar, cerrar ni eliminar publicaciones",
        "cambiar estados de publicaciones",
        "aprobar, rechazar o cancelar solicitudes de recuperación",
        "confirmar devoluciones",
        "ejecutar acciones administrativas o de moderación",
        "contactar al propietario",
        "consultar datos reales",
    ):
        assert limitation in prompt


def test_prompt_contains_explicit_anti_invention_and_actor_rules() -> None:
    prompt = normalized(build_system_prompt("USER"))

    assert "no inventes botones, rutas, filtros, secciones, opciones" in prompt
    assert "no inventes canales de soporte" in prompt
    assert "sistema de soporte integrado" in prompt
    assert "no confundas una publicación con una solicitud" in prompt
    assert "no confundas cerrar una publicación con eliminarla" in prompt
    assert "no confundas cancelar una solicitud con recuperar un objeto" in prompt
    assert "no confundas coincidencias automáticas con una búsqueda manual" in prompt
    assert "no afirmes haber consultado datos" in prompt
    assert "no atribuyas al asistente capacidades" in prompt
    assert "no inventes fotos, notificaciones, chat" in prompt
    assert "moderación" not in prompt.split("reglas de precisión:")[1].split(
        "para preparar una acción:"
    )[0]


def test_prompt_mentions_no_integrated_support_or_contact() -> None:
    prompt = normalized(build_system_prompt("USER"))

    assert "contactar o enviar mensajes privados a otros usuarios" in prompt
    assert "marcar publicaciones como «interesado»" in prompt
    assert "un sistema de soporte integrado dentro de lostfound" in prompt
    assert "no inventes canales de soporte" in prompt
