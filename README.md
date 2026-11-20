# O Benedito

Site estático e painel da galeria. A integração Supabase de testes é habilitada somente em `localhost` e `127.0.0.1`, conforme `backend-config.js`. Publicar estes arquivos sem ajustar essa configuração mantém a demonstração no domínio externo; não ativa a administração real em produção.

Painel local: http://127.0.0.1:8766/#admin

Na máquina Miralto, o iniciador está em `C:/Miralto/Clientes/O Benedito/Administracao/abrir-painel-local.cmd`. Precisa de Node e das ferramentas locais da Miralto. O login usa a conta cadastrada no Auth do projeto, com senha própria; a conta da plataforma Supabase é separada. A sessão fica em memória e pede novo login após recarga.

Backend, permissões, limites e instalação: [supabase/README.md](supabase/README.md). Nunca incluir service role ou senha do banco no frontend. A chave publicável é propositalmente pública; Auth, RPCs e RLS controlam as operações.

Testes locais do backend: `node --experimental-vm-modules --test supabase/tests/validation.test.mjs supabase/tests/codec.test.mjs`. O teste de codec requer a dependência descrita no README do backend. Relatórios de interface e integração ficam na pasta administrativa do cliente, fora do site.

Nenhum push ou deploy do site Render está incluído na ativação local de testes. A passagem para a conta do cliente e a assinatura serão definidas depois da validação.
