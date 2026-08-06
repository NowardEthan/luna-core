import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  descreverImagemPersonalProvider,
  type PersonalProviderVisao,
} from "../src/agentico/especialistas/descreverImagemOpenRouter.js";

const provedor: PersonalProviderVisao = {
  apiKey: "sk-test-123",
  baseUrl: "https://fable.example.com/v1",
  model: "claude-fable-5",
};

describe("descreverImagemPersonalProvider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    // @ts-expect-error: mock fetch global
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("envia foto como image_url", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "um gato laranja" } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const resultado = await descreverImagemPersonalProvider(
      {
        imagem: {
          id: "img-1",
          mimeType: "image/jpeg",
          url: "https://storage.example.com/gato.jpg",
        },
      },
      provedor,
    );

    expect(resultado).toBe("um gato laranja");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://fable.example.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-fable-5");
    expect(body.messages[0].content).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "image_url", image_url: { url: "https://storage.example.com/gato.jpg" } },
    ]);
    expect(init.headers.Authorization).toBe("Bearer sk-test-123");
  });

  it("envia vídeo como video_url", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "pessoa andando de bicicleta" } }],
        }),
        { status: 200 },
      ),
    );

    const resultado = await descreverImagemPersonalProvider(
      {
        imagem: {
          id: "vid-1",
          mimeType: "video/mp4",
          url: "https://storage.example.com/bike.mp4",
          pergunta: "o que está acontecendo?",
        },
      },
      provedor,
    );

    expect(resultado).toBe("pessoa andando de bicicleta");
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.messages[0].content).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "video_url", video_url: { url: "https://storage.example.com/bike.mp4" } },
    ]);
  });

  it("cai pra data URL quando vídeo falha com URL", async () => {
    // 1ª chamada: URL direta → 400
    fetchSpy.mockResolvedValueOnce(
      new Response("bad url", { status: 400, statusText: "Bad Request" }),
    );
    // 2ª chamada: GET na URL do Storage → retorna os bytes do vídeo
    const videoBytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
    fetchSpy.mockResolvedValueOnce(
      new Response(videoBytes, {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "6" },
      }),
    );
    // 3ª chamada: data URL no modelo pessoal → ok
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "pessoa na bike" } }],
        }),
        { status: 200 },
      ),
    );

    const resultado = await descreverImagemPersonalProvider(
      {
        imagem: {
          id: "vid-2",
          mimeType: "video/mp4",
          url: "https://storage.example.com/bike.mp4",
        },
      },
      provedor,
    );

    expect(resultado).toBe("pessoa na bike");
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // 3ª chamada envia data URL
    const body3 = JSON.parse(fetchSpy.mock.calls[2][1].body);
    const dataUrl = body3.messages[0].content[1].video_url.url;
    expect(dataUrl.startsWith("data:video/mp4;base64,")).toBe(true);
  });

  it("cai pra frame JPEG quando vídeo falha nas duas tentativas anteriores", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("erro url", { status: 500, statusText: "Server Error" }));
    fetchSpy.mockResolvedValueOnce(
      new Response("também falhou", { status: 400, statusText: "Bad Request" }),
    );
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "frame mostra ciclista" } }],
        }),
        { status: 200 },
      ),
    );

    const resultado = await descreverImagemPersonalProvider(
      {
        imagem: {
          id: "vid-3",
          mimeType: "video/mp4",
          url: "https://storage.example.com/errado.mp4",
          thumbnailUrl: "https://storage.example.com/frame.jpg",
        },
      },
      provedor,
    );

    expect(resultado).toBe("frame mostra ciclista");
    const bodyFrame = JSON.parse(fetchSpy.mock.calls[2][1].body);
    // Frame vira image_url (não video_url)
    expect(bodyFrame.messages[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://storage.example.com/frame.jpg" },
    });
  });

  it("lança erro com mensagem clara quando tudo falha e não há frame", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("err 500", { status: 500, statusText: "Server Error" }));

    await expect(
      descreverImagemPersonalProvider(
        {
          imagem: {
            id: "vid-4",
            mimeType: "video/mp4",
            url: "https://storage.example.com/x.mp4",
          },
        },
        provedor,
      ),
    ).rejects.toThrow(/vis\u00e3o pessoal falhou/);
  });

  it("lança erro quando anexo não tem URL nem base64", async () => {
    await expect(
      descreverImagemPersonalProvider(
        {
          imagem: { id: "x", mimeType: "image/jpeg" },
        },
        provedor,
      ),
    ).rejects.toThrow(/nada para olhar/);
  });
});