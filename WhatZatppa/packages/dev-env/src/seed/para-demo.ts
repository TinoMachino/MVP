import {SeedClient} from './client'

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

  // ── COMUNIDADES ─────────────────────────────────────────────────────
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

  // ── MEMBERSHIPS (todos se unen a todas) ─────────────────────────────
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

  // ── POSTS PARA ──────────────────────────────────────────────────────
  const posts = [
    {
      agent: alice,
      title: 'Informe de Avance: Techos Verdes',
      text: 'Tras 6 meses de implementación, los techos verdes en 3 edificios piloto han reducido la temperatura interior en 4°C promedio. Solicitamos ampliación a 15 edificios.',
      postType: 'matter',
      tags: ['ambiente', 'arquitectura', 'datos'],
      flairs: ['||#TechosVerdes', '|#RespetoAmbiental'],
    },
    {
      agent: bob,
      title: 'Consulta Pública: Tarifas de Transporte',
      text: 'La Secretaría de Movilidad abre consulta pública sobre ajuste tarifario. ¿Consideras que el incremento propuesto del 8% es justificado por la inflación?',
      postType: 'open_question',
      tags: ['consulta', 'transporte', 'tarifas'],
      flairs: ['||#TransportePublico', '|#?OpenQuestion'],
    },
    {
      agent: carla,
      title: 'RAQ: Becas de Excelencia 2025',
      text: 'Aclaración respecto a las becas de excelencia: el requisito de promedio mínimo es 8.5, no 9.0 como circuló en redes. La convocatoria cierra el 30 de noviembre.',
      postType: 'raq',
      tags: ['educacion', 'becas', 'aclaracion'],
      flairs: ['||#EscuelasPublicas', '|#!RAQ'],
    },
    {
      agent: dan,
      title: 'Propuesta: Banco de Alimentos Municipal',
      text: 'Creemos necesario establecer un banco de alimentos municipal para redistribuir excedentes de mercados y restaurantes hacia comedores comunitarios.',
      postType: 'policy',
      tags: ['alimentacion', 'desperdicio', 'solidaridad'],
      flairs: ['||#ComedoresEscolaresGratuitos', '|#BancoDeAlimentos'],
    },
    {
      agent: eva,
      title: 'Meme: Cuando llega la cuenta de luz',
      text: 'Mi cara cuando veo que el aire acondicionado estuvo prendido todo el fin de semana... 💸⚡😭 #EnergiaSolarYa',
      postType: 'meme',
      tags: ['humor', 'energia', 'domestico'],
      flairs: ['||#EnergiaSolar', '#MEME'],
    },
    {
      agent: alice,
      title: 'Meta: Reunión de Coordinación',
      text: 'Recordatorio: mañana viernes 10:00 hrs reunión de coordinación de vocales en el Centro Cultural Centro. Agenda: asignación de mesas de trabajo.',
      postType: 'meta',
      tags: ['anuncio', 'asamblea', 'coordinacion'],
      flairs: ['||#PresupuestoParticipativo', '#META'],
    },
  ]

  const createdPosts: {uri: string; cid: string; agent: typeof alice}[] = []
  for (const p of posts) {
    const res = await p.agent.com.atproto.repo.createRecord({
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
    createdPosts.push({uri: res.data.uri, cid: res.data.cid, agent: p.agent})
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
    await p.agent.com.atproto.repo.createRecord({
      repo: p.agent.assertDid,
      collection: 'com.para.social.postMeta',
      rkey,
      record: {
        $type: 'com.para.social.postMeta',
        post: p.uri,
        postType: posts[i].postType,
        official: i % 2 === 0,
        voteScore: 50 + Math.floor(Math.random() * 50),
        createdAt: createdAt(),
      },
    })
  }

  await sc.network.processAll()
  console.log('✅ PARA demo seed complete')
  console.log(`   Communities: ${communities.length}`)
  console.log(`   Cabildeos: ${cabildeos.length}`)
  console.log(`   Votes: 14`)
  console.log(`   Positions: 4`)
  console.log(`   Posts: ${posts.length}`)
  console.log(`   Highlights: 3`)
  console.log(`   Delegations: 2`)
}
