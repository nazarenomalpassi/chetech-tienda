function gone() {
  return Response.json(
    { ok: false, error: "gone" },
    {
      status: 410,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

Deno.serve(gone);
