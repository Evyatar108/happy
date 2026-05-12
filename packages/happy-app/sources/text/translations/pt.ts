import type { TranslationStructure } from '../_default';

/**
 * Portuguese plural helper function
 * Portuguese (Brazilian) has 2 plural forms: singular, plural
 * @param options - Object containing count, singular, and plural forms
 * @returns The appropriate form based on Portuguese plural rules
 */
function plural({ count, singular, plural }: { count: number; singular: string; plural: string }): string {
    return count === 1 ? singular : plural;
}

/**
 * Portuguese (Brazilian) translations for the Happy app
 * Must match the exact structure of the English translations
 */
export const pt: TranslationStructure = {
    tabs: {
        // Tab navigation labels
        sessions: 'Terminais',
        settings: 'Configurações',
    },

    common: {
        // Simple string constants
        cancel: 'Cancelar',
        authenticate: 'Autenticar',
        save: 'Salvar',
        saveAs: 'Salvar como',
        error: 'Erro',
        success: 'Sucesso',
        ok: 'OK',
        continue: 'Continuar',
        back: 'Voltar',
        create: 'Criar',
        rename: 'Renomear',
        reset: 'Redefinir',
        logout: 'Sair',
        yes: 'Sim',
        no: 'Não',
        discard: 'Descartar',
        version: 'Versão',
        copied: 'Copiado',
        copy: 'Copiar',
        scanning: 'Escaneando...',
        urlPlaceholder: 'https://exemplo.com',
        home: 'Início',
        message: 'Mensagem',
        files: 'Arquivos',
        fileViewer: 'Visualizador de arquivos',
        loading: 'Carregando...',
        retry: 'Tentar novamente',
        archive: 'Arquivar',
        delete: 'Excluir',
        optional: 'Opcional',
    },

    pendingSwitch: {
        banner: 'Vai alternar para o modo remoto quando a tarefa atual terminar',
    },

    requestSwitch: {
        now: 'Assumir agora',
        whenIdle: 'Enviar quando Claude estiver ocioso',
    },

    cancelPendingSwitch: {
        label: 'Cancelar alternância',
        note: 'A mensagem será descartada',
    },

    abortPrompt: {
        title: 'Mudar para controle remoto?',
        message: 'Claude está executando localmente. Escolha como passar o controle:',
        switchWhenIdle: 'Mudar quando terminar',
        switchNow: 'Mudar agora (cancelar tarefa)',
        cancel: 'Continuar localmente',
    },

    commands: {
        rename: {
            emptyName: 'Adicione um nome ao chat após /rename.',
            failure: 'Não foi possível renomear este chat. Tente novamente.',
        },
    },

    chat: {
        commandOutput: {
            stderrLabel: 'saída de erro',
        },
        boundaryDivider: {
            kind: {
                clear: 'Contexto limpo',
                compact: 'Compactado',
                autocompact: 'Compactado automaticamente',
                planModeEnter: 'Modo de plano ativado',
                planModeExit: 'Modo de plano desativado',
                sessionForkResume: 'Retomado da sessão anterior',
            },
            crossDeviceAdvisory: 'O contexto foi limpo desde que você começou — revisar?',
            showPreClearHistory: 'Mostrar histórico antes da limpeza',
        },
        taskNotification: {
            title: 'Notificação de tarefa',
            taskId: 'ID da tarefa',
            toolUseId: 'ID de uso da ferramenta',
            taskType: 'Tipo de tarefa',
            outputFile: 'Arquivo de saída',
            summary: 'Resumo',
            status: {
                completed: 'Concluída',
                failed: 'Falhou',
                killed: 'Interrompida',
                running: 'Em execução',
                pending: 'Pendente',
                unknown: 'Desconhecido',
            },
        },
    },

    profile: {
        userProfile: 'Perfil do usuário',
        details: 'Detalhes',
        firstName: 'Nome',
        lastName: 'Sobrenome',
        username: 'Nome de usuário',
        status: 'Status',
    },


    status: {
        connected: 'conectado',
        connecting: 'conectando',
        disconnected: 'desconectado',
        error: 'erro',
        online: 'online',
        offline: 'offline',
        lastSeen: ({ time }: { time: string }) => `visto por último ${time}`,
        permissionRequired: 'permissão necessária',
        activeNow: 'Ativo agora',
        unknown: 'desconhecido',
    },

    time: {
        justNow: 'agora mesmo',
        minutesAgo: ({ count }: { count: number }) => `há ${count} minuto${count !== 1 ? 's' : ''}`,
        hoursAgo: ({ count }: { count: number }) => `há ${count} hora${count !== 1 ? 's' : ''}`,
    },

    connect: {
        invalidSecretKey: 'Chave secreta inválida. Verifique e tente novamente.',
        enterUrlManually: 'Inserir URL manualmente',
    },

    settings: {
        title: 'Configurações',
        connectedAccounts: 'Contas conectadas',
        connectAccount: 'Conectar conta',
        github: 'GitHub',
        machines: 'Máquinas',
        showOfflineMachines: ({ count }: { count: number }) => count === 1 ? 'Mostrar 1 máquina offline' : `Mostrar ${count} máquinas offline`,
        hideOfflineMachines: 'Ocultar máquinas offline',
        features: 'Recursos',
        social: 'Social',
        account: 'Conta',
        accountSubtitle: 'Gerencie os detalhes da sua conta',
        appearance: 'Aparência',
        appearanceSubtitle: 'Personalize a aparência do aplicativo',
        featuresTitle: 'Recursos',
        featuresSubtitle: 'Ativar ou desativar recursos do aplicativo',
        developer: 'Desenvolvedor',
        developerTools: 'Ferramentas de desenvolvedor',
        about: 'Sobre',
        aboutFooter: 'Happy Coder is a Codex and Claude Code mobile client that connects through your paired Dev Tunnels machines. Not affiliated with Anthropic.',
        whatsNew: 'Novidades',
        whatsNewSubtitle: 'Veja as atualizações e melhorias mais recentes',
        reportIssue: 'Relatar um problema',
        privacyPolicy: 'Política de privacidade',
        termsOfService: 'Termos de serviço',
        eula: 'EULA',
        supportUs: 'Nos apoie',
        supportUsSubtitlePro: 'Obrigado pelo seu apoio!',
        supportUsSubtitle: 'Apoie o desenvolvimento do projeto',
        githubConnected: ({ login }: { login: string }) => `Conectado como @${login}`,
        connectGithubAccount: 'Conecte sua conta GitHub',
        claudeAuthSuccess: 'Conectado ao Claude com sucesso',
        exchangingTokens: 'Trocando tokens...',
        // Dynamic settings messages
        accountConnected: ({ service }: { service: string }) => `Conta ${service} conectada`,
        machineStatus: ({ name, status }: { name: string; status: 'online' | 'offline' }) =>
            `${name} está ${status === 'online' ? 'online' : 'offline'}`,
        featureToggled: ({ feature, enabled }: { feature: string; enabled: boolean }) =>
            `${feature} ${enabled ? 'ativado' : 'desativado'}`,
    },

    settingsAppearance: {
        // Appearance settings screen
        theme: 'Tema',
        themeDescription: 'Escolha seu esquema de cores preferido',
        themeOptions: {
            adaptive: 'Adaptativo',
            light: 'Claro', 
            dark: 'Escuro',
        },
        themeDescriptions: {
            adaptive: 'Usar configurações do sistema',
            light: 'Sempre usar tema claro',
            dark: 'Sempre usar tema escuro',
        },
        display: 'Exibição',
        displayDescription: 'Controle layout e espaçamento',
        chatTextSizeTitle: 'Tamanho do texto do chat',
        chatTextSizePreview: 'Pré-visualize como as mensagens do chat ficarão neste tamanho.',
        chatTextSizeFooter: 'Arraste o controle para pré-visualizar o tamanho do texto do chat. A nova escala é salva ao soltar.',
        pinchToZoomTitle: 'Pinça para ampliar o chat',
        pinchToZoomDescription: 'Use um gesto de pinça com dois dedos no chat para uma prévia ao vivo do tamanho do texto que é salva ao soltar.',
        paginatedScrollTitle: 'Navegação do chat por páginas',
        paginatedScrollDescription: 'Use zonas de toque estreitas no topo e na parte inferior do chat para avançar por páginas em vez de rolar livremente.',
        socketRangeFetchTitle: 'Transmitir mensagens antigas',
        socketRangeFetchDescription: 'Receba as mensagens mais antigas pelo socket ao vivo em vez de requisições HTTP avulsas, para que cheguem um pouco antes de você rolar até elas.',
        inlineToolCalls: 'Chamadas de ferramentas inline',
        inlineToolCallsDescription: 'Exibir chamadas de ferramentas diretamente nas mensagens do chat',
        expandTodoLists: 'Expandir listas de tarefas',
        expandTodoListsDescription: 'Mostrar todas as tarefas em vez de apenas as mudanças',
        showLineNumbersInDiffs: 'Mostrar números de linha nos diffs',
        showLineNumbersInDiffsDescription: 'Exibir números de linha nos diffs de código',
        showLineNumbersInToolViews: 'Mostrar números de linha nas visualizações de ferramentas',
        showLineNumbersInToolViewsDescription: 'Exibir números de linha nos diffs das visualizações de ferramentas',
        wrapLinesInDiffs: 'Quebrar linhas nos diffs',
        wrapLinesInDiffsDescription: 'Quebrar linhas longas ao invés de rolagem horizontal nas visualizações de diffs',
        diffStyle: 'Visualização do diff',
        diffStyleDescription: 'Mostrar diffs em uma única coluna (unified) ou lado a lado (split). A visualização split funciona apenas na web.',
        diffStyleOptions: {
            unified: 'Unified',
            split: 'Split',
        },
        alwaysShowContextSize: 'Sempre mostrar tamanho do contexto',
        alwaysShowContextSizeDescription: 'Exibir uso do contexto mesmo quando não estiver próximo do limite',
        avatarStyle: 'Estilo do avatar',
        avatarStyleDescription: 'Escolha a aparência do avatar da sessão',
        avatarOptions: {
            pixelated: 'Pixelizado',
            gradient: 'Gradiente',
            brutalist: 'Brutalista',
            brutalistTopic: 'Brutalista por tópico',
        },
        showFlavorIcons: 'Mostrar ícones de provedores de IA',
        showFlavorIconsDescription: 'Exibir ícones do provedor de IA nos avatares de sessão',
    },

    settingsFeatures: {
        // Features settings screen
        experiments: 'Experimentos',
        experimentsDescription: 'Ative recursos experimentais que ainda estão em desenvolvimento. Estes recursos podem ser instáveis ou mudar sem aviso.',
        experimentalFeatures: 'Recursos experimentais',
        experimentalFeaturesEnabled: 'Recursos experimentais ativados',
        experimentalFeaturesDisabled: 'Usando apenas recursos estáveis',
        webFeatures: 'Recursos web',
        webFeaturesDescription: 'Recursos disponíveis apenas na versão web do aplicativo.',
        enterToSend: 'Enter para enviar',
        enterToSendEnabled: 'Pressione Enter para enviar (Shift+Enter para nova linha)',
        enterToSendDisabled: 'Enter insere uma nova linha',
        commandPalette: 'Paleta de comandos',
        commandPaletteEnabled: 'Pressione ⌘K para abrir',
        commandPaletteDisabled: 'Acesso rápido a comandos desativado',
        markdownCopyV2: 'Markdown Copy v2',
        markdownCopyV2Subtitle: 'Pressione e segure para abrir modal de cópia',
        hideInactiveSessions: 'Ocultar sessões inativas',
        hideInactiveSessionsSubtitle: 'Mostre apenas os chats ativos na sua lista',
        privacy: 'Privacidade',
        privacyDescription: 'Desativa completamente toda a análise e telemetria. Nenhum dado será enviado ao PostHog ou qualquer outro serviço de rastreamento.',
        disableAnalytics: 'Desativar análises',
        analyticsDisabled: 'Todo rastreamento e telemetria desativados',
        analyticsEnabled: 'Análises anônimas de uso ativas',
    },

    errors: {
        networkError: 'Ocorreu um erro de rede',
        serverError: 'Ocorreu um erro do servidor',
        unknownError: 'Ocorreu um erro desconhecido',
        connectionTimeout: 'Tempo limite da conexão esgotado',
        authenticationFailed: 'Falha na autenticação',
        permissionDenied: 'Permissão negada',
        fileNotFound: 'Arquivo não encontrado',
        invalidFormat: 'Formato inválido',
        operationFailed: 'Operação falhou',
        tryAgain: 'Por favor, tente novamente',
        contactSupport: 'Entre em contato com o suporte se o problema persistir',
        sessionNotFound: 'Sessão não encontrada',
        oauthInitializationFailed: 'Falha ao inicializar o fluxo OAuth',
        tokenStorageFailed: 'Falha ao armazenar tokens de autenticação',
        oauthStateMismatch: 'Falha na validação de segurança. Por favor, tente novamente',
        tokenExchangeFailed: 'Falha ao trocar código de autorização',
        oauthAuthorizationDenied: 'A autorização foi negada',
        webViewLoadFailed: 'Falha ao carregar a página de autenticação',
        failedToLoadProfile: 'Falha ao carregar o perfil do usuário',
        userNotFound: 'Usuário não encontrado',
        sessionDeleted: 'A sessão foi excluída',
        sessionDeletedDescription: 'Esta sessão foi removida permanentemente',
        requestSwitchFailed: 'Falha ao atualizar a solicitação de alternância',
        sendFailed: 'Falha ao enviar mensagem',
        attachmentPerFileTooLarge: 'Cada anexo deve ter 25 MB ou menos',
        attachmentTotalTooLarge: 'Os anexos devem somar 100 MB ou menos',
        attachmentUploadFailed: 'Não foi possível anexar o arquivo. Tente novamente.',

        // Error functions with context
        fieldError: ({ field, reason }: { field: string; reason: string }) =>
            `${field}: ${reason}`,
        validationError: ({ field, min, max }: { field: string; min: number; max: number }) =>
            `${field} deve estar entre ${min} e ${max}`,
        retryIn: ({ seconds }: { seconds: number }) =>
            `Tentar novamente em ${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`,
        errorWithCode: ({ message, code }: { message: string; code: number | string }) =>
            `${message} (Erro ${code})`,
        failedToLoadFriends: 'Falha ao carregar lista de amigos',
        failedToAcceptRequest: 'Falha ao aceitar solicitação de amizade',
        failedToRejectRequest: 'Falha ao rejeitar solicitação de amizade',
        failedToRemoveFriend: 'Falha ao remover amigo',
        searchFailed: 'A busca falhou. Por favor, tente novamente.',
        failedToSendRequest: 'Falha ao enviar solicitação de amizade',
    },

    newSession: {
        title: 'Iniciar nova sessão',
        selectMachineRequired: 'Selecione uma máquina',
        machineOffline: 'A máquina está offline',
        switchMachinesHint: '• Troque de máquina clicando na máquina acima',
    },

    sessionHistory: {
        // Used by session history screen
        title: 'Histórico de sessões',
        empty: 'Nenhuma sessão encontrada',
        today: 'Hoje',
        yesterday: 'Ontem',
        daysAgo: ({ count }: { count: number }) => `há ${count} ${count === 1 ? 'dia' : 'dias'}`,
        viewAll: 'Ver todas as sessões',
    },

    session: {
        inputPlaceholder: 'Digite uma mensagem ...',
        inactiveArchived: 'Esta sessão está inativa.',
        resumeFromTerminal: 'Para retomá-la pelo terminal:',
        catalogNotReadyBanner: 'A sessão ainda não carregou — envie uma mensagem primeiro para preencher esta lista.',
    },

    commandPalette: {
        placeholder: 'Digite um comando ou pesquise...',
    },

    pickers: {
        noResults: 'Sem resultados',
    },

    drawer: {
        fork: {
            action: 'Bifurcar',
            comingSoon: 'Em breve',
        },
        pinIcon: 'Fixar ícone',
        pinIconDescription: 'Mantenha este ícone da sessão mesmo se o tópico mudar',
        unpinIcon: 'Desafixar ícone',
        applyFailed: 'Falha ao aplicar — tente novamente',
    },

    forkComposer: {
        title: 'Bifurcar sessão',
        parentLabel: ({ name }: { name: string }) => `Bifurcando de ${name}`,
        submit: 'Bifurcar',
        creatingWorktree: 'Criando worktree...',
        createNew: 'Criar novo',
        currentCheckout: 'Checkout atual',
        worktree: 'Worktree',
        machine: 'Máquina',
        agent: 'Agente',
        codex: 'Codex',
        defaultModel: 'modelo padrão',
        defaultPermission: 'padrão',
        defaultEffort: 'padrão',
        searchWorktrees: 'buscar worktrees...',
        searchModels: 'buscar modelos...',
        searchPermissions: 'buscar permissões...',
        searchEffort: 'buscar níveis de esforço...',
        errors: {
            parentMissing: 'Sessão de origem ausente',
            worktreeMissing: ({ directory }: { directory: string }) => `Caminho do worktree indisponível: ${directory}`,
            flavorUnsupported: 'Somente sessões Codex podem ser bifurcadas',
            forkFailed: 'Falha ao bifurcar a sessão',
            createWorktreeFailed: 'Falha ao criar o worktree',
        },
    },

    server: {
        // Used by Server Configuration screen (app/(app)/server.tsx)
        serverConfiguration: 'Configuração do servidor',
        enterServerUrl: 'Por favor, insira uma URL do servidor',
        notValidHappyServer: 'Não é um servidor Happy válido',
        changeServer: 'Alterar servidor',
        continueWithServer: 'Continuar com este servidor?',
        resetToDefault: 'Redefinir para padrão',
        resetServerDefault: 'Redefinir servidor para padrão?',
        validating: 'Validando...',
        validatingServer: 'Validando servidor...',
        serverReturnedError: 'O servidor retornou um erro',
        failedToConnectToServer: 'Falha ao conectar com o servidor',
        currentlyUsingCustomServer: 'Atualmente usando servidor personalizado',
        customServerUrlLabel: 'URL do servidor personalizado',
        advancedFeatureFooter: 'Este é um recurso avançado. Altere o servidor apenas se souber o que está fazendo. Você precisará sair e entrar novamente após alterar servidores.'
    },

    sessionInfo: {
        // Used by Session Info screen (app/(app)/session/[id]/info.tsx)
        killSession: 'Encerrar sessão',
        killSessionConfirm: 'Tem certeza de que deseja encerrar esta sessão?',
        archiveSession: 'Arquivar sessão',
        archiveSessionConfirm: 'Arquivar esta sessão? Sessões arquivadas podem ser retomadas a qualquer momento.',
        happySessionIdCopied: 'ID da sessão Happy copiado para a área de transferência',
        failedToCopySessionId: 'Falha ao copiar ID da sessão Happy',
        happySessionId: 'ID da sessão Happy',
        claudeCodeSessionId: 'ID da sessão Claude Code',
        claudeCodeSessionIdCopied: 'ID da sessão Claude Code copiado para a área de transferência',
        codexThreadId: 'ID da thread do Codex',
        codexThreadIdCopied: 'ID da thread do Codex copiado para a área de transferência',
        aiProvider: 'Provedor de IA',
        failedToCopyClaudeCodeSessionId: 'Falha ao copiar ID da sessão Claude Code',
        failedToCopyCodexThreadId: 'Falha ao copiar ID da thread do Codex',
        metadataCopied: 'Metadados copiados para a área de transferência',
        failedToCopyMetadata: 'Falha ao copiar metadados',
        failedToKillSession: 'Falha ao encerrar sessão',
        failedToArchiveSession: 'Falha ao arquivar sessão',
        connectionStatus: 'Status da conexão',
        created: 'Criado',
        lastUpdated: 'Última atualização',
        sequence: 'Sequência',
        quickActions: 'Ações rápidas',
        viewMachine: 'Ver máquina',
        viewMachineSubtitle: 'Ver detalhes da máquina e sessões',
        resumeSession: 'Retomar sessão',
        resumeSessionSubtitle: 'Retome esta sessão na mesma máquina',
        resumeSessionSameMachineOnly: 'Esta sessão só pode ser retomada na mesma máquina em que começou.',
        resumeSessionMachineOffline: 'Esta máquina está offline. Retomar só fica disponível enquanto ela estiver online.',
        resumeSessionNeedsHappyAgent: 'Retomar não está disponível nesta máquina. Execute `happy-agent auth login` para ativar.',
        resumeSessionMissingMachine: 'Esta sessão não tem metadados da máquina, então não pode ser retomada.',
        resumeSessionMissingBackendId: 'Esta sessão não tem um identificador Claude ou Codex retomável.',
        resumeSessionUnexpectedDirectoryPrompt: 'Retomar não pode criar diretórios. Inicie a sessão manualmente pelo caminho original.',
        killSessionSubtitle: 'Encerrar imediatamente a sessão',
        archiveSessionSubtitle: 'Arquivar esta sessão e pará-la',
        metadata: 'Metadados',
        host: 'Host',
        path: 'Caminho',
        operatingSystem: 'Sistema operacional',
        processId: 'ID do processo',
        happyHome: 'Diretório Happy',
        copyMetadata: 'Copiar metadados',
        agentState: 'Estado do agente',
        controlledByUser: 'Controlado pelo usuário',
        pendingRequests: 'Solicitações pendentes',
        activity: 'Atividade',
        thinking: 'Pensando',
        thinkingSince: 'Pensando desde',
        cliVersion: 'Versão do CLI',
        cliVersionOutdated: 'Atualização do CLI necessária',
        cliVersionOutdatedMessage: ({ currentVersion, requiredVersion }: { currentVersion: string; requiredVersion: string }) =>
            `Versão ${currentVersion} instalada. Atualize para ${requiredVersion} ou posterior`,
        updateCliInstructions: 'Por favor execute npm install -g happy@latest',
        deleteSession: 'Excluir sessão',
        deleteSessionSubtitle: 'Remover permanentemente esta sessão',
        deleteSessionConfirm: 'Excluir sessão permanentemente?',
        deleteSessionWarning: 'Esta ação não pode ser desfeita. Todas as mensagens e dados associados a esta sessão serão excluídos permanentemente.',
        failedToDeleteSession: 'Falha ao excluir sessão',
        sessionDeleted: 'Sessão excluída com sucesso',
        worktreeCleanupTitle: 'Excluir Worktree?',
        worktreeCleanupMessage: 'O Worktree não tem alterações não confirmadas. Deseja excluir os arquivos do Worktree?',
        worktreeCleanupDelete: 'Excluir Worktree',
        worktreeCleanupKeep: 'Manter arquivos',
        plugins: 'Plugins',
        pluginsSubtitle: 'Ver plugins carregados nesta sessão',
        skills: 'Habilidades',
        skillsSubtitle: 'Ver habilidades carregadas nesta sessão',
        agents: 'Agentes',
        agentsSubtitle: 'Ver subagentes disponíveis para esta sessão',

    },

    components: {
        emptyMainScreen: {
            // Used by EmptyMainScreen component
            readyToCode: 'Pronto para programar?',
            installCli: 'Instale o Happy CLI',
            runIt: 'Execute',
            scanQrCode: 'Escaneie o código QR',
            openCamera: 'Abrir câmera',
        },
    },

    agentInput: {
        permissionMode: {
            title: 'MODO DE PERMISSÃO',
            default: 'Padrão',
            acceptEdits: 'Aceitar edições',
            plan: 'Modo de planejamento',
            dontAsk: 'Não perguntar',
            bypassPermissions: 'Modo Yolo',
            badgeAcceptAllEdits: 'Aceitar todas as edições',
            badgeBypassAllPermissions: 'Ignorar todas as permissões',
            badgePlanMode: 'Modo de planejamento',
        },
        textSize: {
            title: 'TAMANHO DO TEXTO',
        },
        chatWidth: {
            title: 'Largura do chat',
        },
        agent: {
            claude: 'Claude',
            codex: 'Codex',
            gemini: 'Gemini',
            openclaw: 'OpenClaw',
        },
        model: {
            title: 'MODELO',
            configureInCli: 'Configurar modelos nas configurações do CLI',
        },
        effort: {
            title: 'ESFORÇO',
        },
        codexPermissionMode: {
            title: 'MODO DE PERMISSÃO CODEX',
            default: 'Configurações do CLI',
            readOnly: 'Read Only Mode',
            safeYolo: 'Safe YOLO',
            yolo: 'YOLO',
            badgeReadOnly: 'Read Only Mode',
            badgeSafeYolo: 'Safe YOLO',
            badgeYolo: 'YOLO',
        },
        codexModel: {
            title: 'CODEX MODEL',
            gpt5CodexLow: 'gpt-5-codex low',
            gpt5CodexMedium: 'gpt-5-codex medium',
            gpt5CodexHigh: 'gpt-5-codex high',
            gpt5Minimal: 'GPT-5 Minimal',
            gpt5Low: 'GPT-5 Low',
            gpt5Medium: 'GPT-5 Medium',
            gpt5High: 'GPT-5 High',
        },
        geminiPermissionMode: {
            title: 'MODO DE PERMISSÃO GEMINI',
            default: 'Padrão',
            autoEdit: 'Edição automática',
            yolo: 'YOLO',
            plan: 'Planejamento',
            badgeAutoEdit: 'Edição automática',
            badgeYolo: 'YOLO',
            badgePlan: 'Planejamento',
        },
        context: {
            remaining: ({ percent }: { percent: number }) => `${percent}% restante`,
        },
        suggestion: {
            fileLabel: 'ARQUIVO',
            folderLabel: 'PASTA',
        },
        attachments: {
            attachButton: 'Anexar arquivo',
            dropIdle: 'Solte arquivos aqui',
            dropActive: 'Solte para anexar',
            pasteHint: 'Cole arquivos para anexar',
            removeButton: ({ name }: { name: string }) => `Remover ${name}`,
        },
        noMachinesAvailable: 'Sem máquinas',
    },

    machineLauncher: {
        showLess: 'Mostrar menos',
        showAll: ({ count }: { count: number }) => `Mostrar todos (${count} caminhos)`,
        enterCustomPath: 'Inserir caminho personalizado',
        offlineUnableToSpawn: 'Não é possível criar nova sessão, você está offline',
    },

    sidebar: {
        sessionsTitle: 'Happy',
        showArchived: 'Mostrar arquivadas',
        hideArchived: 'Ocultar arquivadas',
        show: 'Mostrar barra lateral',
        hide: 'Ocultar barra lateral',
        hideHint: 'Entra no modo de foco máximo; um botão de menu restaura a barra lateral',
        expand: 'Expandir barra lateral',
        collapse: 'Recolher barra lateral',
    },

    toolView: {
        input: 'Entrada',
        output: 'Saída',
    },

    tools: {
        fullView: {
            description: 'Descrição',
            inputParams: 'Parâmetros de entrada',
            output: 'Saída',
            error: 'Erro',
            completed: 'Ferramenta concluída com sucesso',
            noOutput: 'Nenhuma saída foi produzida',
            running: 'Ferramenta está executando...',
            rawJsonDevMode: 'JSON bruto (modo desenvolvedor)',
        },
        taskView: {
            initializing: 'Inicializando agente...',
            moreTools: ({ count }: { count: number }) => `+${count} mais ${plural({ count, singular: 'ferramenta', plural: 'ferramentas' })}`,
            moreSteps: ({ count }: { count: number }) => `+${count} mais ${plural({ count, singular: 'etapa', plural: 'etapas' })}`,
        },
        taskOutput: {
            taskId: ({ taskId }: { taskId: string }) => `Task ${taskId}`,
            blocking: 'Blocking',
            timeout: ({ timeout }: { timeout: number }) => `Timeout: ${timeout}ms`,
            parseError: 'Task output result could not be parsed',
            running: 'Waiting for task output...',
            truncated: 'Output truncated',
        },
        taskStop: {
            taskId: ({ taskId }: { taskId: string }) => `Task ${taskId}`,
            parseError: 'Task stop result could not be parsed',
            running: 'Stopping task...',
            stopped: 'Stopped',
            notFound: 'Not found',
            alreadyStopped: 'Already stopped',
        },
        edit: {
            parseError: 'Não foi possível analisar a entrada de edição',
        },
        multiEdit: {
            editNumber: ({ index, total }: { index: number; total: number }) => `Edição ${index} de ${total}`,
            replaceAll: 'Substituir tudo',
            parseError: 'Não foi possível analisar a entrada de MultiEdit',
        },
        diff: {
            showMore: ({ count }: { count: number }) => count === 1 ? 'Mostrar mais 1 linha' : `Mostrar mais ${count} linhas`,
            collapse: 'Recolher',
        },
        names: {
            task: 'Tarefa',
            agent: 'Agente',
            taskOutput: 'Saída da tarefa',
            taskOutputWithId: ({ taskId }: { taskId: string }) => `Task Output · ${taskId}`,
            taskStop: 'Parar tarefa',
            taskStopWithId: ({ taskId }: { taskId: string }) => `Stop Task · ${taskId}`,
            taskList: 'Lista de tarefas',
            taskGet: 'Obter tarefa',
            taskUpdate: 'Atualizar tarefa',
            terminal: 'Terminal',
            searchFiles: 'Buscar arquivos',
            search: 'Buscar',
            searchContent: 'Buscar conteúdo',
            listFiles: 'Listar arquivos',
            planProposal: 'Proposta de plano',
            readFile: 'Ler arquivo',
            editFile: 'Editar arquivo',
            writeFile: 'Escrever arquivo',
            fetchUrl: 'Buscar URL',
            readNotebook: 'Ler notebook',
            editNotebook: 'Editar notebook',
            todoList: 'Lista de tarefas',
            webSearch: 'Busca web',
            reasoning: 'Raciocínio',
            applyChanges: 'Atualizar arquivo',
            viewDiff: 'Alterações do arquivo atual',
            question: 'Pergunta',
        },
        desc: {
            terminalCmd: ({ cmd }: { cmd: string }) => `Terminal(cmd: ${cmd})`,
            searchPattern: ({ pattern }: { pattern: string }) => `Buscar(padrão: ${pattern})`,
            searchPath: ({ basename }: { basename: string }) => `Buscar(caminho: ${basename})`,
            fetchUrlHost: ({ host }: { host: string }) => `Buscar URL(url: ${host})`,
            editNotebookMode: ({ path, mode }: { path: string; mode: string }) => `Editar notebook(arquivo: ${path}, modo: ${mode})`,
            todoListCount: ({ count }: { count: number }) => `Lista de tarefas(quantidade: ${count})`,
            webSearchQuery: ({ query }: { query: string }) => `Busca web(consulta: ${query})`,
            grepPattern: ({ pattern }: { pattern: string }) => `grep(padrão: ${pattern})`,
            multiEditEdits: ({ path, count }: { path: string; count: number }) => `${path} (${count} edições)`,
            readingFile: ({ file }: { file: string }) => `Lendo ${file}`,
            writingFile: ({ file }: { file: string }) => `Escrevendo ${file}`,
            modifyingFile: ({ file }: { file: string }) => `Modificando ${file}`,
            modifyingFiles: ({ count }: { count: number }) => `Modificando ${count} arquivos`,
            modifyingMultipleFiles: ({ file, count }: { file: string; count: number }) => `${file} e ${count} mais`,
            showingDiff: 'Mostrando alterações',
        },
        askUserQuestion: {
            submit: 'Enviar resposta',
            multipleQuestions: ({ count }: { count: number }) => `${count} ${plural({ count, singular: 'pergunta', plural: 'perguntas' })}`,
            other: 'Outro',
            otherDescription: 'Digite sua própria resposta',
            otherPlaceholder: 'Digite sua resposta...',
        }
    },

    files: {
        changes: 'Alterações',
        refreshChanges: 'Atualizar alterações',
        refreshChangesHint: 'Buscar alterações de arquivos mais recentes',
        searchPlaceholder: 'Buscar arquivos...',
        detachedHead: 'HEAD desanexado',
        summary: ({ staged, unstaged }: { staged: number; unstaged: number }) => `${staged} preparados • ${unstaged} não preparados`,
        notRepo: 'Não é um repositório git',
        notUnderGit: 'Este diretório não está sob controle de versão git',
        searching: 'Buscando arquivos...',
        noFilesFound: 'Nenhum arquivo encontrado',
        noFilesInProject: 'Nenhum arquivo no projeto',
        tryDifferentTerm: 'Tente um termo de busca diferente',
        searchResults: ({ count }: { count: number }) => `Resultados da busca (${count})`,
        projectRoot: 'Raiz do projeto',
        stagedChanges: ({ count }: { count: number }) => `Alterações preparadas (${count})`,
        unstagedChanges: ({ count }: { count: number }) => `Alterações não preparadas (${count})`,
        // File viewer strings
        loadingFile: ({ fileName }: { fileName: string }) => `Carregando ${fileName}...`,
        binaryFile: 'Arquivo binário',
        cannotDisplayBinary: 'Não é possível exibir o conteúdo do arquivo binário',
        diff: 'Diff',
        file: 'Arquivo',
        fileEmpty: 'Arquivo está vazio',
        noChanges: 'Nenhuma alteração para exibir',
        noChangesTitle: 'Sem alterações',
        noChangesSubtitle: 'A árvore de trabalho está limpa',
        deleted: 'Excluído',
    },

    settingsAccount: {
        // Account settings screen
        accountInformation: 'Informações da conta',
        status: 'Status',
        statusActive: 'Ativo',
        statusNotAuthenticated: 'Não autenticado',
        anonymousId: 'ID anônimo',
        publicId: 'ID público',
        notAvailable: 'Não disponível',
        linkNewDevice: 'Vincular novo dispositivo',
        profile: 'Perfil',
        name: 'Nome',
        github: 'GitHub',
        tapToDisconnect: 'Toque para desconectar',
        server: 'Servidor',
        backup: 'Backup',
        tapToReveal: 'Toque para revelar',
        tapToHide: 'Toque para ocultar',
        privacy: 'Privacidade',
        privacyDescription: 'Ajude a melhorar o aplicativo compartilhando dados de uso anônimos. Nenhuma informação pessoal é coletada.',
        analytics: 'Análises',
        analyticsDisabled: 'Nenhum dado é compartilhado',
        analyticsEnabled: 'Dados de uso anônimos são compartilhados',
        dangerZone: 'Zona perigosa',
        logout: 'Sair',
        logoutSubtitle: 'Sair e limpar dados locais',
        logoutConfirm: 'Tem certeza de que quer sair? Certifique-se de ter feito backup da sua chave secreta!',
    },

    settingsLanguage: {
        // Language settings screen
        title: 'Idioma',
        description: 'Escolher o idioma preferido para a interface do aplicativo. Isso vai ser sincronizado em todos os seus dispositivos.',
        currentLanguage: 'Idioma atual',
        automatic: 'Automático',
        automaticSubtitle: 'Detectar das configurações do dispositivo',
        needsRestart: 'Idioma alterado',
        needsRestartMessage: 'O aplicativo precisa ser reiniciado para aplicar a nova configuração de idioma.',
        restartNow: 'Reiniciar agora',
    },


    updateBanner: {
        updateAvailable: 'Atualização disponível',
        pressToApply: 'Pressione para aplicar a atualização',
        whatsNew: 'Novidades',
        seeLatest: 'Veja as atualizações e melhorias mais recentes',
        nativeUpdateAvailable: 'Atualização do aplicativo disponível',
        tapToUpdateAppStore: 'Toque para atualizar na App Store',
        tapToUpdatePlayStore: 'Toque para atualizar na Play Store',
    },

    changelog: {
        // Used by the changelog screen
        version: ({ version }: { version: number }) => `Versão ${version}`,
        noEntriesAvailable: 'Nenhuma entrada de changelog disponível.',
    },


    modals: {
        // Used across connect flows and settings
        authenticateTerminal: 'Autenticar terminal',
        pasteUrlFromTerminal: 'Cole a URL de autenticação do seu terminal',
        deviceLinkedSuccessfully: 'Dispositivo vinculado com sucesso',
        terminalConnectedSuccessfully: 'Terminal conectado com sucesso',
        invalidAuthUrl: 'URL de autenticação inválida',
        developerMode: 'Modo desenvolvedor',
        developerModeEnabled: 'Modo desenvolvedor ativado',
        developerModeDisabled: 'Modo desenvolvedor desativado',
        disconnectGithub: 'Desconectar GitHub',
        disconnectGithubConfirm: 'Tem certeza de que deseja desconectar sua conta GitHub?',
        disconnect: 'Desconectar',
        failedToConnectTerminal: 'Falha ao conectar terminal',
        cameraPermissionsRequiredToConnectTerminal: 'Permissões de câmera são necessárias para conectar terminal',
        failedToLinkDevice: 'Falha ao vincular dispositivo',
        cameraPermissionsRequiredToScanQr: 'Permissões de câmera são necessárias para escanear códigos QR'
    },

    navigation: {
        // Navigation titles and screen headers
        linkNewDevice: 'Vincular novo dispositivo', 
        whatsNew: 'Novidades',
        friends: 'Amigos',
    },

    welcome: {
        // Main welcome screen for unauthenticated users
        title: 'Cliente móvel Codex e Claude Code',
        subtitle: 'Criptografado ponta a ponta e sua conta é armazenada apenas no seu dispositivo.',
        createAccount: 'Criar conta',
        linkOrRestoreAccount: 'Vincular ou restaurar conta',
        loginWithMobileApp: 'Fazer login com aplicativo móvel',
        pairMachine: 'Parear máquina',
        noMachinesForIdentity: 'Nenhuma máquina retornada para esta identidade do GitHub',
        deviceAuthorizationExpired: 'A autorização do dispositivo do GitHub expirou',
        pairingFailed: 'Failed to pair machine',
        selectMachine: 'Select a machine',
        selectMachineSubtitle: ({ login }: { login: string }) => `Signed in as @${login}. Choose a machine to connect.`,
        thisServer: 'This server',
        connectTo: 'Connect',
        online: 'Online',
        offline: 'Offline',
    },

    review: {
        // Used by utils/requestReview.ts
        enjoyingApp: 'Curtindo o aplicativo?',
        feedbackPrompt: 'Adoraríamos ouvir seu feedback!',
        yesILoveIt: 'Sim, eu amo!',
        notReally: 'Não muito'
    },

    items: {
        // Used by Item component for copy toast
        copiedToClipboard: ({ label }: { label: string }) => `${label} copiado para a área de transferência`
    },

    machine: {
        offlineUnableToSpawn: 'Inicializador desativado enquanto a máquina está offline',
        offlineHelp: '• Verifique se seu computador está online\n• Execute `happy daemon status` para diagnosticar\n• Você está usando a versão mais recente do CLI? Atualize com `npm install -g happy@latest`',
        launchNewSessionInDirectory: 'Iniciar nova sessão no diretório',
        daemon: 'Daemon',
        status: 'Status',
        stopDaemon: 'Parar daemon',
        lastKnownPid: 'Último PID conhecido',
        lastKnownHttpPort: 'Última porta HTTP conhecida',
        startedAt: 'Iniciado em',
        cliVersion: 'Versão do CLI',
        daemonStateVersion: 'Versão do estado do daemon',
        activeSessions: ({ count }: { count: number }) => `Sessões ativas (${count})`,
        machineGroup: 'Máquina',
        host: 'Host',
        machineId: 'ID da máquina',
        username: 'Nome de usuário',
        homeDirectory: 'Diretório home',
        platform: 'Plataforma',
        architecture: 'Arquitetura',
        lastSeen: 'Visto pela última vez',
        never: 'Nunca',
        metadataVersion: 'Versão dos metadados',
        cliAvailability: 'Disponibilidade de CLI',
        cliInstalled: 'Instalado',
        cliNotFound: 'Não encontrado',
        lastDetected: 'Última detecção',
        untitledSession: 'Sessão sem título',
        back: 'Voltar',
        dangerZone: 'Zona de perigo',
        delete: 'Excluir máquina',
        deleteFooter: 'Remove esta máquina da sua conta. O histórico de sessões será preservado, mas você não poderá iniciar novas sessões nesta máquina.',
        deleteConfirmTitle: 'Excluir esta máquina?',
        deleteConfirmMessage: 'A máquina será removida da sua conta. O histórico de sessões será preservado, mas você não poderá iniciar novas sessões até reconectar o daemon.',
        deleteFailed: 'Falha ao excluir a máquina.',
    },

    message: {
        switchedToMode: ({ mode }: { mode: string }) => `Mudou para o modo ${mode}`,
        unknownEvent: 'Evento desconhecido',
        usageLimitUntil: ({ time }: { time: string }) => `Limite de uso atingido até ${time}`,
        unknownTime: 'horário desconhecido',
    },

    codex: {
        // Codex permission dialog buttons
        permissions: {
            yesForSession: 'Sim, e não perguntar para esta sessão',
            stopAndExplain: 'Parar, e explicar o que fazer',
        }
    },

    claude: {
        // Claude permission dialog buttons
        permissions: {
            yesAllowAllEdits: 'Sim, permitir todas as edições durante esta sessão',
            yesAllowEverything: 'Sim, permitir tudo durante esta sessão',
            yesForTool: 'Sim, não perguntar novamente para esta ferramenta',
            noTellClaude: 'Não, fornecer feedback',
        }
    },

    textSelection: {
        // Text selection screen
        selectText: 'Selecionar intervalo de texto',
        title: 'Selecionar texto',
        noTextProvided: 'Nenhum texto fornecido',
        textNotFound: 'Texto não encontrado ou expirado',
        textCopied: 'Texto copiado para a área de transferência',
        failedToCopy: 'Falha ao copiar o texto para a área de transferência',
        noTextToCopy: 'Nenhum texto disponível para copiar',
    },

    markdown: {
        // Markdown copy functionality
        codeCopied: 'Código copiado',
        copyFailed: 'Falha ao copiar',
        mermaidRenderFailed: 'Falha ao renderizar diagrama mermaid',
    },

    friends: {
        // Friends feature
        title: 'Amigos',
        manageFriends: 'Gerencie seus amigos e conexões',
        searchTitle: 'Buscar amigos',
        pendingRequests: 'Solicitações de amizade',
        myFriends: 'Meus amigos',
        noFriendsYet: 'Você ainda não tem amigos',
        findFriends: 'Buscar amigos',
        remove: 'Remover',
        pendingRequest: 'Pendente',
        sentOn: ({ date }: { date: string }) => `Enviado em ${date}`,
        accept: 'Aceitar',
        reject: 'Rejeitar',
        addFriend: 'Adicionar amigo',
        alreadyFriends: 'Já são amigos',
        requestPending: 'Solicitação pendente',
        searchInstructions: 'Digite um nome de usuário para buscar amigos',
        searchPlaceholder: 'Digite o nome de usuário...',
        searching: 'Buscando...',
        userNotFound: 'Usuário não encontrado',
        noUserFound: 'Nenhum usuário encontrado com esse nome',
        checkUsername: 'Por favor, verifique o nome de usuário e tente novamente',
        howToFind: 'Como encontrar amigos',
        findInstructions: 'Procure amigos pelo nome de usuário. Tanto você quanto seu amigo precisam ter o GitHub conectado para enviar solicitações de amizade.',
        requestSent: 'Solicitação de amizade enviada!',
        requestAccepted: 'Solicitação de amizade aceita!',
        requestRejected: 'Solicitação de amizade rejeitada',
        friendRemoved: 'Amigo removido',
        confirmRemove: 'Remover amigo',
        confirmRemoveMessage: 'Tem certeza de que deseja remover este amigo?',
        cannotAddYourself: 'Você não pode enviar uma solicitação de amizade para si mesmo',
        bothMustHaveGithub: 'Ambos os usuários devem ter o GitHub conectado para serem amigos',
        status: {
            none: 'Não conectado',
            requested: 'Solicitação enviada',
            pending: 'Solicitação pendente',
            friend: 'Amigos',
            rejected: 'Rejeitada',
        },
        acceptRequest: 'Aceitar solicitação',
        removeFriend: 'Remover dos amigos',
        removeFriendConfirm: ({ name }: { name: string }) => `Tem certeza de que deseja remover ${name} dos seus amigos?`,
        requestSentDescription: ({ name }: { name: string }) => `Sua solicitação de amizade foi enviada para ${name}`,
        requestFriendship: 'Solicitar amizade',
        cancelRequest: 'Cancelar solicitação de amizade',
        cancelRequestConfirm: ({ name }: { name: string }) => `Cancelar sua solicitação de amizade para ${name}?`,
        denyRequest: 'Recusar solicitação',
        nowFriendsWith: ({ name }: { name: string }) => `Agora você é amigo de ${name}`,
    },
} as const;

export type TranslationsPt = typeof pt;
