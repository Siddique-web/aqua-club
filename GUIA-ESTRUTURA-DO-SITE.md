# Aqua Club — guia de estrutura, fotografias e conversão

Este guia descreve **o site tal como está feito** (nada foi retirado: fotos, menus e imagens mantêm-se), onde entra cada fotografia, o ritmo visual, os botões de conversão e as regras dos pedidos.

---
## 0. Mapa das fotografias

| Ficheiro | O que mostra | Onde aparece |
|---|---|---|
| `hero-aerea.jpg` | Vista aérea do complexo | Galeria 3D (1.ª foto) · fundo desfocado do topo · faixa de ondas |
| `piscina.jpg` | Piscina com guarda-sóis de palha | Galeria 3D · cartão "Piscina de Ondas & Lazer" (Atrações) |
| `piscina-guarda-sois.jpg` ★ | Piscina, guarda-sóis e muros brancos | Galeria 3D · **Espaços 1** (foto grande) · faixa de ondas |
| `piscina-edificio.jpg` ★ | Piscina e edifício com esplanada | Galeria 3D · **Espaços 1** (foto pequena) |
| `kids.jpg` | Parque infantil e trampolim | Galeria 3D · cartão "Aqua Kids" · **Espaços 2** (pequena) |
| `parque-jogos.jpg` ★ | Baloiços, escorregas e ténis de mesa | Galeria 3D · **Espaços 2** (grande) |
| `parque.jpg` | Relvado e parque infantil | Galeria 3D ("Jardim & espaço exterior") |
| `zona-jogos.jpg` ★ | Mesas de bilhar na esplanada coberta | Galeria 3D · **Espaços 3** (grande) |
| `bar.jpg` | Esplanada e balcão do bar | Galeria 3D · cartão "Bar & Gastronomia" |
| `bar-balcao.jpg` ★ | Balcão do bar com bilhares em primeiro plano | Galeria 3D · **Espaços 3** (pequena) |
| `restaurante.jpg` | Sala de refeições | Galeria 3D |
| `salao.jpg` ★ | Salão do restaurante, mesas e candeeiros | Galeria 3D · **Espaços 4** (grande) |
| `salao-mesa.jpg` ★ | Mesa com dois quadros abstratos | Galeria 3D · **Espaços 4** (pequena) |
| `panorama.jpg` | Piscina e espaço exterior | Galeria 3D · topo do cartão "Horário de funcionamento" |
| `petiscos.jpg`, `prato-petiscos*.jpg` | Bruschettas e petiscos | Menu ("Bruschettas", "Petiscos variados") · mural de pratos · galeria |
| `sobremesas.jpg`, `prato-mousse*.jpg` | Mousse gourmet com frutos vermelhos | Menu ("Mousse gourmet") · mural de pratos · galeria |
| `prato-bar.jpg`, `prato-sala.jpg` | **Atenção:** são o balcão do bar e a sala de refeições (não são pratos) | Mural de pratos, como cartões de ambiente "Bar & esplanada" e "Sala de refeições" |
| `logo.png`, `favicon.png` | Logótipo circular | Cabeçalho, rodapé, abertura, separador do navegador |

★ = fotografias novas desta versão.
**Em falta:** fotos de pratos principais, de cocktails e de sumos (os cartões azuis do menu esperam por elas), e dos toboáguas, rio lento e cabanas.

---
## 1. Estrutura da página (ordem exata, do topo ao rodapé)

| # | Secção (âncora) | Objetivo | Título / texto | Fotografias | Botões |
|---|---|---|---|---|---|
| 1 | **Cabeçalho** | Orientar e converter logo | Início · Atrações · Horários & Lazer · Gastronomia & Bar · Contacto | Logótipo | **Reservar Dia** |
| 2 | **Topo / galeria 3D** (`#inicio`) | Impacto emocional em 5 segundos | "Mergulhe no melhor dia de lazer da sua vida." + números (6 zonas · 7/7 · Kids) | **16 fotos** em carrossel 3D (foto grande ao centro, legenda, filtros Água / Espaço / Gastronomia / Jogos, botão Expandir) | Reservar o meu dia · Explorar atrações |
| 3 | **Faixa de ondas** | Ritmo e movimento entre blocos | (decorativa) | 13 pílulas redondas com fotos | — |
| 4 | **Atrações** (`#atracoes`) | Mostrar as 6 zonas de relance | "Tudo num só lugar" | Piscina, Aqua Kids, Bar (círculos); toboáguas, rio e cabanas com ícone | Ver o menu · Ver experiências |
| 5 | **Espaços** (`#espacos`) | Contar a história de cada espaço com fotos grandes | "Cada canto pensado para si" | 4 blocos × 2 fotos (principal + pequena sobreposta) | Reservar o meu dia · Ver a experiência Família · Ver o menu · Pedir da mesa |
| 6 | **Menu / Gastronomia & Bar** (`#menu`) | Abrir o apetite e levar ao pedido | "O nosso menu" + 3 passos + mural "Os pratos do Aqua Club" | Mural vertical (pratos e bebidas) + cartões do menu com preço | **+** (adicionar) · Ver todos os pratos · Pedido · Chamar garçom |
| 7 | **Experiências** (`#experiencias`) | Escolher o tipo de visita | "Escolha a sua experiência" (Entrada geral · Família · Cabana VIP · Grupo/Evento) | Ícones | **+** (leva à reserva com a experiência escolhida) |
| 8 | **Horários & Lazer** (`#horarios`) | Informar e fechar a reserva | Horários + aviso das crianças + formulário | `panorama.jpg` | **Enviar pedido por WhatsApp** |
| 9 | **Perguntas frequentes** (`#faq`) | Tirar dúvidas sem ligar | "Tudo o que precisa de saber" (9 perguntas) | — | — |
| 10 | **Como chegar + contacto** (`#contactos`) | Facilitar a visita e o contacto | Morada, telefone, WhatsApp, e-mail · Fale connosco · Avaliação | — | Abrir no mapa · Ligar · WhatsApp · Enviar |
| 11 | **Rodapé** | Navegação final e redes | Descrição, links rápidos, redes sociais | Logótipo | Instagram · Facebook · WhatsApp |
| ★ | **Botões flutuantes** (sempre visíveis) | Serviço à mesa em qualquer ponto | — | — | **Chamar garçom** · **Os meus pedidos / Pedido** |

---
## 2. Layout e ritmo visual

- **Alternância fundo claro / areia:** topo (azul-claro) → atrações (areia) → espaços (branco) → menu (areia) → experiências (branco) → horários → FAQ (areia) → contactos (branco) → rodapé preto. Evita cansaço e marca o início de cada ideia.
- **Espaços em ziguezague:** foto grande à esquerda e texto à direita; no bloco seguinte, inverte. A foto pequena sobrepõe-se ao canto e dá profundidade. Em telemóvel empilha (foto, depois texto).
- **Galeria 3D no topo:** uma única foto grande domina; as laterais inclinam-se e escurecem para guiar o olhar. Filtros redondos à esquerda (no telemóvel, por cima).
- **Círculos nas atrações:** transformam fotos e ícones no mesmo formato, para que as zonas ainda sem foto (toboáguas, rio, cabanas) não pareçam "buracos".
- **Mural de pratos:** colunas verticais a subir e a descer criam movimento sem distrair; ficam ao lado dos 3 passos para ligar "ver" a "pedir".
- **Efeitos:** todos os blocos fazem *fade-in* ao descer a página; botões e cartões sobem ligeiramente ao passar o rato.

---
## 3. Botões de conversão (CTAs) por zona

| Zona | Botão principal | Botão secundário |
|---|---|---|
| Cabeçalho | **Reservar Dia** | — |
| Topo | **Reservar o meu dia** | Explorar atrações |
| Atrações | Ver o menu (bar) · Ver experiências (cabanas) | — |
| Espaços | Reservar o meu dia · Ver a experiência Família · **Ver o menu** · **Pedir da mesa** | Toque na foto para ampliar |
| Menu | **+** em cada prato · "Ver todos os pratos" | Pesquisa e categorias |
| Mesa (sempre) | **Chamar garçom** · **Pedido / Os meus pedidos** | "Precisa de ajuda?" (dica na primeira visita) |
| Experiências | **+** → reserva já preenchida | — |
| Horários | **Enviar pedido por WhatsApp** | — |
| Contactos | Abrir no mapa · Ligar agora · Falar no WhatsApp · Escrever | Fale connosco · Avaliação |

---
## 4. Gastronomia & menus — como agrupar as fotos de comida

1. **Mural vertical (abre o apetite):** três colunas com `prato-mousse`, `petiscos`, `sobremesas`, `prato-petiscos-d1/d2`, `prato-mousse-d1`, mais os cartões de ambiente (`prato-bar`, `prato-sala`) e os cartões azuis das bebidas. Cada cartão mostra **nome e preço** e abre os detalhes.
2. **Grelha do menu (decide e pede):** foto grande + nome + frase curta + preço + **+**. Separadores: Todos · Petiscos · Sobremesas · Bebidas, e pesquisa.
3. **Regra de ouro das fotos de comida:** vistas de cima ou a 45°, luz natural, uma só tonalidade de fundo, o prato a ocupar ~70% do enquadramento. As fotos atuais (tabuleiros e taças) funcionam bem em recortes verticais 2:3.
4. **O que falta fotografar:** cocktails (2 ou 3), sumos naturais, 3 a 4 pratos principais e uma foto de mesa servida. Basta pôr os ficheiros em `site/assets/` e indicar o nome no `MENU` e no `WALL` (ver guia passo a passo).

---
## 5. Pedidos, identificação e conta — como funciona (e os limites)

**O que o site faz hoje**
1. O cliente escolhe a mesa (ou lê o QR da mesa), junta pratos e **tem de indicar nome e telemóvel** e **aceitar os termos**: "o pedido é meu, não pode ser cancelado e vou pagá-lo antes de sair".
2. O pedido recebe um **código único** (ex.: `AQ-1008-K3F9`), data e hora, e fica **registado em nome do cliente**.
3. **Não existe botão para cancelar** um pedido enviado. Para alterar algo, o cliente tem de chamar o garçom. Só a equipa cancela (com motivo, que fica registado).
4. O cliente vê **"Os meus pedidos"**: lista, histórico, estado (enviado / recebido / em preparação / a caminho / entregue) e **quanto está por pagar**. O botão flutuante fica amarelo com "Conta · X MT por pagar" enquanto houver conta aberta.
5. **Pagar:** no local (dinheiro/cartão: o garçom traz a conta) ou por transferência móvel (M-Pesa / e-Mola): o cliente declara o pagamento e o restaurante **confirma**.

**Com WhatsApp (sem base de dados)**
- Cada pedido chega ao WhatsApp do restaurante **a partir do telemóvel do próprio cliente**, com nome, número, mesa, itens, total e código. O número do remetente prova quem pediu.
- A lista e o histórico do cliente ficam guardados no telemóvel dele. O restaurante vê os pedidos na conversa do WhatsApp (sugestão: um telemóvel só para isso, e o garçom anota o código no caderno de contas da mesa).

**Com a base de dados (Supabase) + painel da equipa**
- O restaurante vê tudo em `site/painel.html`: pedidos por estado, contas por mesa, histórico com pesquisa (nome, telemóvel, código, mesa), exportação CSV, e a **linha do tempo** de cada pedido (quem mudou o quê e quando). Contas entregues e por pagar há muito tempo ficam a vermelho.

**Limites honestos**
- Nenhum site consegue **impedir fisicamente** que alguém saia sem pagar. O que o sistema faz é **identificar, registar o compromisso e mostrar a conta em aberto** a cliente e equipa, o que dissuade e dá prova (nome, telemóvel, hora, termos aceites). Para bares com muito movimento, considere pedir o pagamento **no momento do pedido** ou um valor de reserva nas cabanas.
- O nome e o número são os que o cliente escreve; no modo WhatsApp o número do remetente confirma-o. Revise os "Termos do pedido" com um jurista e informe os clientes sobre o tratamento dos dados.
- O site **não cobra online**. Pagamento por M-Pesa/e-Mola/cartão com confirmação automática exige conta empresarial e chaves do fornecedor, num servidor.
