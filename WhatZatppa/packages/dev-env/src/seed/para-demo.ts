import {SeedClient} from './client'

const postMetaType = (type: string): 'policy' | 'matter' | 'meme' => {
  if (type === 'policy' || type === 'meme') return type
  return 'matter'
}

export default async (sc: SeedClient) => {
  const createdAt = () => new Date().toISOString()
  const login = async (identifier: string, password: string) => {
    const agent = sc.network.pds.getAgent()
    await agent.login({identifier, password})
    return agent
  }

  // ── USUARIOS ────────────────────────────────────────────────────────
  const alice = await login('alice.test', 'hunter2')
  const bob = await login('bob.test', 'hunter2')
  const carla = await login('carla.test', 'hunter2')

  // Create dan & eva if they don't exist yet (mock setup only has alice/bob/carla)
  if (!sc.dids.dan) {
    await sc.createAccount('dan', {
      email: 'dan@test.com',
      handle: 'dan.test',
      password: 'hunter2',
    })
  }
  if (!sc.dids.eva) {
    await sc.createAccount('eva', {
      email: 'eva@test.com',
      handle: 'eva.test',
      password: 'hunter2',
    })
  }

  const dan = await login('dan.test', 'hunter2')
  const eva = await login('eva.test', 'hunter2')

  const users = [
    {agent: alice, did: alice.assertDid, name: 'Alice'},
    {agent: bob, did: bob.assertDid, name: 'Bob'},
    {agent: carla, did: carla.assertDid, name: 'Carla'},
    {agent: dan, did: dan.assertDid, name: 'Dan'},
    {agent: eva, did: eva.assertDid, name: 'Eva'},
  ]

  // ── FOLLOWS (todos siguen a todos para que los posts aparezcan en timelines)
  for (const follower of users) {
    for (const followee of users) {
      if (follower.did !== followee.did) {
        await follower.agent.app.bsky.graph.follow.create(
          {repo: follower.did},
          {subject: followee.did, createdAt: createdAt()},
        )
      }
    }
  }

  // ── PARTIDOS POLÍTICOS (community boards) ───────────────────────────
  const partyDefs = [
    {name: 'Morena', color: '#610200', creator: alice, official: alice, deputy: bob},
    {name: 'PAN', color: '#004990', creator: bob, official: bob, deputy: carla},
    {name: 'PRI', color: '#CE1126', creator: carla, official: carla, deputy: dan},
    {name: 'PVEM', color: '#50B747', creator: dan, official: dan, deputy: eva},
    {name: 'PT', color: '#D92027', creator: eva, official: eva, deputy: alice},
    {name: 'MC', color: '#FF8300', creator: alice, official: alice, deputy: carla},
  ]

  const partyBoards: {
    name: string
    uri: string
    cid: string
    creatorDid: string
    slug: string
    rkey: string
  }[] = []

  for (const p of partyDefs) {
    const board = await p.creator.com.para.community.createBoard({
      name: p.name,
      quadrant: 'national',
      description: `Comunidad oficial del partido político ${p.name}. Espacio de deliberación, propuestas y coordinación ciudadana.`,
    })

    const uri = board.data.uri
    const rkey = uri.split('/').pop()!
    const slugBase = p.name
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    const slug = `${slugBase}-${rkey}`

    partyBoards.push({
      name: p.name,
      uri,
      cid: board.data.cid,
      creatorDid: p.creator.assertDid,
      slug,
      rkey,
    })
  }

  // Activate party boards (change status from draft to active)
  for (const pb of partyBoards) {
    const creatorAgent = users.find(u => u.did === pb.creatorDid)!.agent
    const current = await creatorAgent.com.atproto.repo.getRecord({
      repo: pb.creatorDid,
      collection: 'com.para.community.board',
      rkey: pb.rkey,
    })
    await creatorAgent.com.atproto.repo.putRecord({
      repo: pb.creatorDid,
      collection: 'com.para.community.board',
      rkey: pb.rkey,
      record: {
        ...(current.data.value as any),
        status: 'active',
      },
      swapRecord: current.data.cid,
    })
  }

  // Make all users join every party
  for (const user of users) {
    for (const pb of partyBoards) {
      if (user.did !== pb.creatorDid) {
        await user.agent.com.para.community.join({communityUri: pb.uri})
      }
    }
  }

  // Update party governance with officials and deputies
  for (let i = 0; i < partyDefs.length; i++) {
    const p = partyDefs[i]
    const pb = partyBoards[i]
    const current = await p.creator.com.atproto.repo.getRecord({
      repo: p.creator.assertDid,
      collection: 'com.para.community.governance',
      rkey: pb.slug,
    })
    const currentGov = current.data.value as any

    await p.creator.com.atproto.repo.putRecord({
      repo: p.creator.assertDid,
      collection: 'com.para.community.governance',
      rkey: pb.slug,
      record: {
        ...currentGov,
        updatedAt: createdAt(),
        officials: [
          {
            did: p.official.assertDid,
            office: 'Representante Oficial',
            mandate: `Mandato como representante oficial de ${p.name}`,
          },
        ],
        deputies: [
          {
            key: `${pb.slug}-digital-deputy`,
            tier: 'community',
            role: 'Diputado Digital',
            description: `Representante digital de ${p.name} para cabildeos comunitarios.`,
            capabilities: ['represent_community', 'vote_on_cabildeos'],
            activeHolder: {
              did: p.deputy.assertDid,
              handle: (p.deputy as any).session?.handle || '',
              displayName: users.find(u => u.did === p.deputy.assertDid)?.name || '',
            },
            activeSince: createdAt(),
            votes: 1,
            applicants: [],
          },
        ],
        metadata: {
          ...currentGov.metadata,
          state: 'active',
          lastPublishedAt: createdAt(),
        },
        editHistory: [
          ...(currentGov.editHistory || []),
          {
            id: `seed-officials-${p.name.toLowerCase()}`,
            action: 'set_official_representatives',
            actorDid: p.creator.assertDid,
            createdAt: createdAt(),
            summary: `Seeded official representative and deputy for ${p.name}.`,
          },
        ],
      },
      swapRecord: current.data.cid,
    })
  }

  // ── COMUNIDADES CÍVICAS ─────────────────────────────────────────────
  const community1 = await alice.com.para.community.createBoard({
    name: 'Presupuesto Participativo Centro',
    quadrant: 'centro',
    description:
      'Asamblea ciudadana para decidir la inversión pública en el centro de la ciudad.',
  })
  const community2 = await bob.com.para.community.createBoard({
    name: 'Movilidad Sostenible Norte',
    quadrant: 'norte',
    description:
      'Espacio de deliberación sobre transporte público, ciclovías y movilidad activa.',
  })
  const community3 = await carla.com.para.community.createBoard({
    name: 'Educación y Cultura Sur',
    quadrant: 'sur',
    description:
      'Comunidad dedicada a la mejora de escuelas públicas y centros culturales.',
  })

  const communities = [
    {uri: community1.data.uri, name: 'Presupuesto Participativo Centro'},
    {uri: community2.data.uri, name: 'Movilidad Sostenible Norte'},
    {uri: community3.data.uri, name: 'Educación y Cultura Sur'},
  ]

  // ── MEMBERSHIPS CÍVICAS (todos se unen a todas) ─────────────────────
  for (const user of users) {
    for (const comm of communities) {
      if (comm.uri !== community1.data.uri || user.did !== alice.assertDid) {
        await user.agent.com.para.community.join({communityUri: comm.uri})
      }
    }
  }

  // ── CABILDEOS ───────────────────────────────────────────────────────
  const cab1 = await alice.com.atproto.repo.createRecord({
    repo: alice.assertDid,
    collection: 'com.para.civic.cabildeo',
    record: {
      $type: 'com.para.civic.cabildeo',
      title: 'Renovación de Parques Públicos del Centro',
      description:
        'Propuesta para renovar 12 parques públicos del centro histórico con mobiliario urbano accesible, áreas verdes y centros de carga solar. Se solicita la aprobación del presupuesto participativo 2025.',
      community: communities[0].uri,
      options: [
        {label: 'Aprobar presupuesto completo', description: '12 parques, 18 meses'},
        {label: 'Aprobar fase piloto', description: '4 parques, 6 meses'},
        {label: 'Rechazar y reponer', description: 'Esperar dictamen ambiental'},
      ],
      phase: 'voting',
      phaseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      minQuorum: 10,
      flairs: ['||#PresupuestoParticipativo', '|#EspacioPublico'],
      createdAt: createdAt(),
    },
  })

  const cab2 = await bob.com.atproto.repo.createRecord({
    repo: bob.assertDid,
    collection: 'com.para.civic.cabildeo',
    record: {
      $type: 'com.para.civic.cabildeo',
      title: 'Ciclovía Metropolitana Conectada',
      description:
        'Diseño de una red ciclista de 45 km que conecte la periferia norte con los centros de trabajo, escuelas y mercados. Incluye carriles protegidos y estaciones de reparación.',
      community: communities[1].uri,
      options: [
        {label: 'Construir red completa', description: '45 km en 24 meses'},
        {label: 'Construir tramo piloto', description: '8 km zona universitaria'},
      ],
      phase: 'deliberating',
      phaseDeadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      minQuorum: 15,
      flairs: ['||#MovilidadActiva', '|#Ciclovia'],
      createdAt: createdAt(),
    },
  })

  const cab3 = await carla.com.atproto.repo.createRecord({
    repo: carla.assertDid,
    collection: 'com.para.civic.cabildeo',
    record: {
      $type: 'com.para.civic.cabildeo',
      title: 'Comedores Escolares Gratuitos',
      description:
        'Iniciativa para garantizar una comida nutritiva diaria a todos los estudiantes de escuelas públicas de la zona sur. Financiamiento mixto: federal 60%, municipal 30%, privado 10%.',
      community: communities[2].uri,
      options: [
        {label: 'Implementar inmediatamente', description: 'Cobertura 100% en 12 meses'},
        {label: 'Fase piloto por distrito', description: '3 distritos, evaluación anual'},
      ],
      phase: 'open',
      phaseDeadline: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      minQuorum: 20,
      flairs: ['||#ComedoresEscolaresGratuitos', '|#NutricionInfantil'],
      createdAt: createdAt(),
    },
  })

  const cab4 = await alice.com.atproto.repo.createRecord({
    repo: alice.assertDid,
    collection: 'com.para.civic.cabildeo',
    record: {
      $type: 'com.para.civic.cabildeo',
      title: 'Energía Solar en Edificios Públicos',
      description:
        'Instalación de paneles solares en 50 edificios gubernamentales para reducir la huella de carbono y generar ahorros presupuestarios. El proyecto ya fue aprobado y está en fase de licitación.',
      community: communities[0].uri,
      options: [
        {label: 'Licitación pública nacional', description: 'Proveedor único, 36 meses'},
        {label: 'Licitación modular por lotes', description: '5 lotes, 18 meses'},
      ],
      phase: 'resolved',
      phaseDeadline: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      minQuorum: 8,
      flairs: ['||#EnergiaSolar', '|#RespetoAmbiental'],
      createdAt: createdAt(),
    },
  })

  const cabildeos = [
    {uri: cab1.data.uri, cid: cab1.data.cid, title: 'Renovación de Parques'},
    {uri: cab2.data.uri, cid: cab2.data.cid, title: 'Ciclovía Metropolitana'},
    {uri: cab3.data.uri, cid: cab3.data.cid, title: 'Comedores Escolares'},
    {uri: cab4.data.uri, cid: cab4.data.cid, title: 'Energía Solar'},
  ]

  // ── POSICIONES (stances) ────────────────────────────────────────────
  await alice.com.atproto.repo.createRecord({
    repo: alice.assertDid,
    collection: 'com.para.civic.position',
    record: {
      $type: 'com.para.civic.position',
      cabildeo: cabildeos[0].uri,
      stance: 'for',
      optionIndex: 0,
      text: 'Los parques son el corazón de la ciudad. La inversión completa generará empleo verde y mejora de calidad de vida.',
      createdAt: createdAt(),
    },
  })

  await bob.com.atproto.repo.createRecord({
    repo: bob.assertDid,
    collection: 'com.para.civic.position',
    record: {
      $type: 'com.para.civic.position',
      cabildeo: cabildeos[0].uri,
      stance: 'against',
      optionIndex: 2,
      text: 'Prefiero esperar el dictamen ambiental antes de comprometer fondos. La premura puede generar sobrecostos.',
      createdAt: createdAt(),
    },
  })

  await carla.com.atproto.repo.createRecord({
    repo: carla.assertDid,
    collection: 'com.para.civic.position',
    record: {
      $type: 'com.para.civic.position',
      cabildeo: cabildeos[1].uri,
      stance: 'for',
      optionIndex: 0,
      text: 'La red completa es ambiciosa pero necesaria. La movilidad activa reduce contaminación y mejora la salud pública.',
      createdAt: createdAt(),
    },
  })

  await dan.com.atproto.repo.createRecord({
    repo: dan.assertDid,
    collection: 'com.para.civic.position',
    record: {
      $type: 'com.para.civic.position',
      cabildeo: cabildeos[2].uri,
      stance: 'amendment',
      optionIndex: 1,
      text: 'Apoyo la idea pero sugiero iniciar por distrito para ajustar el modelo antes de escalar.',
      createdAt: createdAt(),
    },
  })

  // ── VOTOS ───────────────────────────────────────────────────────────
  const castVote = async (
    agent: typeof alice,
    did: string,
    cabUri: string,
    optionIndex: number,
  ) => {
    await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: 'com.para.civic.vote',
      record: {
        $type: 'com.para.civic.vote',
        subject: cabUri,
        subjectType: 'cabildeo',
        cabildeo: cabUri,
        selectedOption: optionIndex,
        isDirect: true,
        createdAt: createdAt(),
      },
    })
  }

  // Votos en cabildeo 1 (parques)
  await castVote(alice, alice.assertDid, cabildeos[0].uri, 0)
  await castVote(bob, bob.assertDid, cabildeos[0].uri, 2)
  await castVote(carla, carla.assertDid, cabildeos[0].uri, 0)
  await castVote(dan, dan.assertDid, cabildeos[0].uri, 1)
  await castVote(eva, eva.assertDid, cabildeos[0].uri, 0)

  // Votos en cabildeo 2 (ciclovía)
  await castVote(alice, alice.assertDid, cabildeos[1].uri, 0)
  await castVote(bob, bob.assertDid, cabildeos[1].uri, 0)
  await castVote(carla, carla.assertDid, cabildeos[1].uri, 0)
  await castVote(dan, dan.assertDid, cabildeos[1].uri, 1)

  // Votos en cabildeo 3 (comedores)
  await castVote(carla, carla.assertDid, cabildeos[2].uri, 0)
  await castVote(dan, dan.assertDid, cabildeos[2].uri, 1)
  await castVote(eva, eva.assertDid, cabildeos[2].uri, 0)

  // Votos en cabildeo 4 (energía solar — ya resuelto)
  await castVote(alice, alice.assertDid, cabildeos[3].uri, 1)
  await castVote(bob, bob.assertDid, cabildeos[3].uri, 0)

  // ── POSTS ───────────────────────────────────────────────────────────
  // Civic posts (associated with civic communities)
  const civicPosts = [
    {
      agent: alice,
      party: 'Morena',
      title: 'Informe de Avance: Techos Verdes',
      text: 'Tras 6 meses de implementación, los techos verdes en 3 edificios piloto han reducido la temperatura interior en 4°C promedio. Solicitamos ampliación a 15 edificios.',
      postType: 'matter',
      tags: ['ambiente', 'arquitectura', 'datos'],
      flairs: ['||#TechosVerdes', '|#RespetoAmbiental'],
    },
    {
      agent: bob,
      party: 'PAN',
      title: 'Consulta Pública: Tarifas de Transporte',
      text: 'La Secretaría de Movilidad abre consulta pública sobre ajuste tarifario. ¿Consideras que el incremento propuesto del 8% es justificado por la inflación?',
      postType: 'open_question',
      tags: ['consulta', 'transporte', 'tarifas'],
      flairs: ['||#TransportePublico', '|#?OpenQuestion'],
    },
    {
      agent: carla,
      party: 'PRI',
      title: 'RAQ: Becas de Excelencia 2025',
      text: 'Aclaración respecto a las becas de excelencia: el requisito de promedio mínimo es 8.5, no 9.0 como circuló en redes. La convocatoria cierra el 30 de noviembre.',
      postType: 'raq',
      tags: ['educacion', 'becas', 'aclaracion'],
      flairs: ['||#EscuelasPublicas', '|#!RAQ'],
    },
    {
      agent: dan,
      party: 'PVEM',
      title: 'Propuesta: Banco de Alimentos Municipal',
      text: 'Creemos necesario establecer un banco de alimentos municipal para redistribuir excedentes de mercados y restaurantes hacia comedores comunitarios.',
      postType: 'policy',
      tags: ['alimentacion', 'desperdicio', 'solidaridad'],
      flairs: ['||#ComedoresEscolaresGratuitos', '|#BancoDeAlimentos'],
    },
    {
      agent: eva,
      party: 'PT',
      title: 'Meme: Cuando llega la cuenta de luz',
      text: 'Mi cara cuando veo que el aire acondicionado estuvo prendido todo el fin de semana... 💸⚡😭 #EnergiaSolarYa',
      postType: 'meme',
      tags: ['humor', 'energia', 'domestico'],
      flairs: ['||#EnergiaSolar', '#MEME'],
    },
    {
      agent: alice,
      party: 'MC',
      title: 'Meta: Reunión de Coordinación',
      text: 'Recordatorio: mañana viernes 10:00 hrs reunión de coordinación de vocales en el Centro Cultural Centro. Agenda: asignación de mesas de trabajo.',
      postType: 'meta',
      tags: ['anuncio', 'asamblea', 'coordinacion'],
      flairs: ['||#PresupuestoParticipativo', '#META'],
    },
  ]

  // Party-specific posts (designed to show up in community profile search)
  const partyPosts = [
    // Morena
    {
      agent: alice,
      party: 'Morena',
      title: 'Reforma Energética Morena',
      text: 'Desde Morena impulsamos la reforma energética para garantizar precios justos de electricidad a todas las familias mexicanas. La soberanía energética es prioridad nacional.',
      postType: 'policy',
      tags: ['Morena', '||#Policy', 'reforma', 'energia'],
      flairs: ['||#Policy', '||#EmpresaPublicaDeAgua'],
    },
    {
      agent: bob,
      party: 'Morena',
      title: 'Consulta Morena: Salario Mínimo',
      text: 'Morena consulta a la base: ¿apoyas la propuesta de incrementar el salario mínimo a 12,000 pesos mensuales con prestaciones completas?',
      postType: 'raq',
      tags: ['Morena', '|#!RAQ', 'salario', 'trabajo'],
      flairs: ['|#!RAQ'],
    },
    // PAN
    {
      agent: bob,
      party: 'PAN',
      title: 'Iniciativa Anticorrupción PAN',
      text: 'El PAN presenta iniciativa de fortalecimiento institucional anticorrupción con fiscalía autónoma, rendición de cuentas y protección a denunciantes.',
      postType: 'policy',
      tags: ['PAN', '||#Policy', 'anticorrupcion', 'instituciones'],
      flairs: ['||#Policy', '||#LimiteDeMandatos'],
    },
    {
      agent: carla,
      party: 'PAN',
      title: 'PAN pregunta a ciudadanos',
      text: 'PAN pregunta: ¿cuál es tu prioridad para el siguiente período legislativo? Seguridad, economía, salud o educación.',
      postType: 'open_question',
      tags: ['PAN', '|#?OpenQuestion', 'prioridades', 'legislativo'],
      flairs: ['|#?OpenQuestion'],
    },
    // PRI
    {
      agent: carla,
      party: 'PRI',
      title: 'Modernización Energética PRI',
      text: 'El PRI impulsa la modernización del sector energético con inversión privada participativa y transición sustentable hacia energías limpias.',
      postType: 'policy',
      tags: ['PRI', '||#Policy', 'energia', 'modernizacion'],
      flairs: ['||#Policy', '||#FondoDeAdaptacionAlCambioClimatico'],
    },
    {
      agent: dan,
      party: 'PRI',
      title: 'PRI consulta a militantes',
      text: 'El PRI consulta a militantes: ¿estás de acuerdo con la alianza opositora para las elecciones de 2025? Tu opinión cuenta.',
      postType: 'raq',
      tags: ['PRI', '|#!RAQ', 'alianza', 'elecciones'],
      flairs: ['|#!RAQ'],
    },
    // PVEM
    {
      agent: dan,
      party: 'PVEM',
      title: 'Ley de Cambio Climático PVEM',
      text: 'PVEM propone ley integral de cambio climático con metas claras de reducción de emisiones para 2030 y fondo de adaptación ecológica.',
      postType: 'policy',
      tags: ['PVEM', '||#Policy', 'clima', 'emisiones'],
      flairs: ['||#Policy', '||#FondoDeAdaptacionAlCambioClimatico'],
    },
    {
      agent: eva,
      party: 'PVEM',
      title: 'Análisis PVEM: Calidad del Aire',
      text: 'PVEM presenta análisis sobre calidad del aire en zonas metropolitanas. Se requieren acciones urgentes en 8 ciudades.',
      postType: 'matter',
      tags: ['PVEM', '|#Matter', 'aire', 'salud'],
      flairs: ['|#Matter', '||#ServiciosPublicosDeSalud'],
    },
    // PT
    {
      agent: eva,
      party: 'PT',
      title: 'Incremento Salarial PT',
      text: 'El PT exige incremento inmediato al salario mínimo y garantía de prestaciones laborales para todos los trabajadores del país.',
      postType: 'policy',
      tags: ['PT', '||#Policy', 'salario', 'trabajadores'],
      flairs: ['||#Policy', '||#ComedoresEscolaresGratuitos'],
    },
    {
      agent: alice,
      party: 'PT',
      title: 'PT consulta: Política Social',
      text: 'El PT consulta a la ciudadanía: ¿qué política social debería ser prioridad nacional? Vivienda, salud, educación o alimentación.',
      postType: 'open_question',
      tags: ['PT', '|#?OpenQuestion', 'social', 'prioridad'],
      flairs: ['|#?OpenQuestion'],
    },
    // MC
    {
      agent: alice,
      party: 'MC',
      title: 'Presupuesto Participativo MC',
      text: 'Movimiento Ciudadano propone presupuesto participativo con votación digital ciudadana y transparencia total en el gasto público.',
      postType: 'policy',
      tags: ['MC', '||#Policy', 'presupuesto', 'digital'],
      flairs: ['||#Policy', '||#PresupuestoParticipativo'],
    },
    {
      agent: carla,
      party: 'MC',
      title: 'MC: Consulta Movilidad Urbana',
      text: 'MC analiza resultados de la consulta ciudadana sobre movilidad urbana. El 78% apoya ampliación de transporte público.',
      postType: 'matter',
      tags: ['MC', '|#Matter', 'movilidad', 'urbana'],
      flairs: ['|#Matter', '||#TransportePublico'],
    },
  ]

  const allPosts = [...civicPosts, ...partyPosts]

  const createdPosts: {uri: string; cid: string; agent: typeof alice; party: string; postType: string}[] = []
  for (const p of allPosts) {
    // 1. Create com.para.post record
    const paraRes = await p.agent.com.atproto.repo.createRecord({
      repo: p.agent.assertDid,
      collection: 'com.para.post',
      record: {
        $type: 'com.para.post',
        title: p.title,
        text: p.text,
        createdAt: createdAt(),
        postType: p.postType,
        tags: p.tags,
        flairs: p.flairs,
      },
    })
    createdPosts.push({uri: paraRes.data.uri, cid: paraRes.data.cid, agent: p.agent, party: p.party, postType: p.postType})

    // 2. Mirror to app.bsky.feed.post with party name in text and tags
    //    so it appears in search, timeline, and community filters.
    const bskyText = `[${p.party}] ${p.title}\n\n${p.text}`
    await p.agent.app.bsky.feed.post.create(
      {repo: p.agent.assertDid},
      {
        text: bskyText,
        createdAt: createdAt(),
        tags: p.tags,
      },
    )
  }

  // ── HIGHLIGHTS / ANOTACIONES ────────────────────────────────────────
  await alice.com.atproto.repo.createRecord({
    repo: alice.assertDid,
    collection: 'com.para.highlight.annotation',
    record: {
      $type: 'com.para.highlight.annotation',
      subjectUri: createdPosts[0].uri,
      subjectCid: createdPosts[0].cid,
      text: 'Dato clave: reducción de 4°C es significativa. Vale la pena citar en el dictamen.',
      start: 40,
      end: 90,
      color: '#22c55e',
      visibility: 'public',
      tag: 'dato-relevante',
      createdAt: createdAt(),
    },
  })

  await bob.com.atproto.repo.createRecord({
    repo: bob.assertDid,
    collection: 'com.para.highlight.annotation',
    record: {
      $type: 'com.para.highlight.annotation',
      subjectUri: createdPosts[1].uri,
      subjectCid: createdPosts[1].cid,
      text: 'Ojo: la consulta cierra en 48 hrs. Hay que difundir.',
      start: 0,
      end: 50,
      color: '#f59e0b',
      visibility: 'public',
      tag: 'urgente',
      createdAt: createdAt(),
    },
  })

  await carla.com.atproto.repo.createRecord({
    repo: carla.assertDid,
    collection: 'com.para.highlight.annotation',
    record: {
      $type: 'com.para.highlight.annotation',
      subjectUri: createdPosts[2].uri,
      subjectCid: createdPosts[2].cid,
      text: 'Corrección importante para quienes ya enviaron solicitud con promedio 8.5.',
      start: 60,
      end: 110,
      color: '#3b82f6',
      visibility: 'private',
      tag: 'correccion',
      createdAt: createdAt(),
    },
  })

  // ── DELEGACIONES ────────────────────────────────────────────────────
  await dan.com.atproto.repo.createRecord({
    repo: dan.assertDid,
    collection: 'com.para.civic.delegation',
    record: {
      $type: 'com.para.civic.delegation',
      cabildeo: cabildeos[0].uri,
      delegateTo: alice.assertDid,
      scopeFlairs: ['||#PresupuestoParticipativo'],
      reason:
        'Confío en el criterio de Alice respecto a infraestructura urbana. Delego mi voto para este cabildeo.',
      createdAt: createdAt(),
    },
  })

  await eva.com.atproto.repo.createRecord({
    repo: eva.assertDid,
    collection: 'com.para.civic.delegation',
    record: {
      $type: 'com.para.civic.delegation',
      delegateTo: carla.assertDid,
      scopeFlairs: ['||#ComedoresEscolaresGratuitos', '||#EducacionLaica'],
      reason:
        'Carla tiene amplia experiencia en políticas educativas. Le delego mi voz en estos temas.',
      createdAt: createdAt(),
    },
  })

  // ── POST META (scores) ──────────────────────────────────────────────
  for (let i = 0; i < createdPosts.length; i++) {
    const p = createdPosts[i]
    const rkey = p.uri.split('/').pop()
    if (!rkey) continue

    // Find the party board slug for this post's party
    const partyBoard = partyBoards.find(pb => pb.name === p.party)

    await p.agent.com.atproto.repo.createRecord({
      repo: p.agent.assertDid,
      collection: 'com.para.social.postMeta',
      rkey,
      record: {
        $type: 'com.para.social.postMeta',
        post: p.uri,
        postType: postMetaType(p.postType),
        party: `p/${p.party}`,
        community: partyBoard ? partyBoard.slug : undefined,
        official: i % 2 === 0,
        voteScore: 50 + Math.floor(Math.random() * 50),
        createdAt: createdAt(),
      },
    })
  }

  await sc.network.processAll()
  console.log('✅ PARA demo seed complete')
  console.log(`   Party boards: ${partyBoards.length}`)
  console.log(`   Civic communities: ${communities.length}`)
  console.log(`   Cabildeos: ${cabildeos.length}`)
  console.log(`   Votes: 14`)
  console.log(`   Positions: 4`)
  console.log(`   Posts: ${allPosts.length}`)
  console.log(`   Highlights: 3`)
  console.log(`   Delegations: 2`)
  console.log(`   Parties covered: Morena, PAN, PRI, PVEM, PT, MC`)
}
