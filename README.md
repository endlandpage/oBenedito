# O Benedito

Site estático e painel da galeria com Supabase ativo no Render e nos hosts locais autorizados em `backend-config.js`. O painel online usa Auth e a lista administrativa do projeto Supabase; alterações salvas afetam a galeria publicada.

Painel online: https://o-benedito.onrender.com/#admin

Painel local: http://127.0.0.1:8766/#admin

Na máquina Miralto, o iniciador está em `C:/Miralto/Clientes/O Benedito/Administracao/abrir-painel-local.cmd`. Precisa de Node e das ferramentas locais da Miralto. O login usa a conta cadastrada no Auth do projeto, com senha própria; a conta da plataforma Supabase é separada. A sessão fica em memória e pede novo login após recarga.

Backend, permissões, limites e instalação: [supabase/README.md](supabase/README.md). Nunca incluir service role ou senha do banco no frontend. A chave publicável é propositalmente pública; Auth, RPCs e RLS controlam as operações.

Testes locais do backend: `node --experimental-vm-modules --test supabase/tests/validation.test.mjs supabase/tests/codec.test.mjs`. O teste de codec requer a dependência descrita no README do backend. Relatórios de interface e integração ficam na pasta administrativa do cliente, fora do site.

O serviço Render existente deve usar `node build-public.cjs` e publicar somente `dist/`, conforme `render.yaml`. O build copia por lista explícita os arquivos públicos, externaliza scripts e estilos e exclui backend, migrations, testes, documentação e configurações. Cabeçalhos CSP e X-Frame-Options são aplicados pelo Render, não por meta HTML. Não publicar a raiz do repositório. A passagem para a conta do cliente e a assinatura serão definidas depois da validação.


Política CSP: scripts e folhas de estilo somente da própria origem; atributos de estilo continuam permitidos para o layout e animações, sem permitir scripts inline ou eval. Fotos e API usam somente o projeto Supabase indicado; o mapa usa maps.google.com. `frame-ancestors none` e `X-Frame-Options DENY` impedem incorporar o site, incluindo /#admin. Não adicionar fallback global para index.html em caminhos inexistentes.

Alterar cabeçalhos em `security-config.cjs`, gerar `node build-public.cjs --write-blueprint` e conferir o plano Render antes de aplicar. A configuração só é efetiva após sincronizar o serviço e verificar HTTP real.
