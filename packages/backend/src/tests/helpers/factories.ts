import { db } from '../../database/index.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Factory for creating test users
 */
export async function createTestUser(overrides: {
    email?: string;
    password?: string;
    name?: string;
} = {}) {
    const email = overrides.email || `test-${Date.now()}@example.com`;
    const password = overrides.password || 'password123';
    const name = overrides.name || 'Test User';

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await db
        .insertInto('users')
        .values({
            email,
            password_hash: hashedPassword,
            name,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return { ...user, plainPassword: password };
}

/**
 * Factory for creating test organizations
 */
export async function createTestOrganization(overrides: {
    name?: string;
    slug?: string;
    ownerId?: string;
} = {}) {
    const name = overrides.name || `Test Org ${Date.now()}`;
    const slug = overrides.slug || `test-org-${Date.now()}`;

    // Create owner if not provided
    let ownerId = overrides.ownerId;
    if (!ownerId) {
        const owner = await createTestUser();
        ownerId = owner.id;
    }

    const organization = await db
        .insertInto('organizations')
        .values({
            name,
            slug,
            owner_id: ownerId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    // Add owner to organization
    await db
        .insertInto('organization_members')
        .values({
            user_id: ownerId,
            organization_id: organization.id,
            role: 'owner',
        })
        .execute();

    return organization;
}

/**
 * Factory for creating test projects
 */
export async function createTestProject(overrides: {
    name?: string;
    organizationId?: string;
    userId?: string;
} = {}) {
    const name = overrides.name || `Test Project ${Date.now()}`;

    // Create organization if not provided
    let organizationId = overrides.organizationId;
    let userId = overrides.userId;

    if (!organizationId) {
        const org = await createTestOrganization();
        organizationId = org.id;
        userId = org.owner_id;
    } else if (!userId) {
        // If org is provided but not user, get the org owner
        const org = await db
            .selectFrom('organizations')
            .select('owner_id')
            .where('id', '=', organizationId)
            .executeTakeFirstOrThrow();
        userId = org.owner_id;
    }

    const project = await db
        .insertInto('projects')
        .values({
            name,
            organization_id: organizationId,
            user_id: userId!,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return project;
}

/**
 * Factory for creating test API keys
 */
export async function createTestApiKey(overrides: {
    projectId?: string;
    name?: string;
} = {}) {
    // Create project if not provided
    let projectId = overrides.projectId;
    if (!projectId) {
        const project = await createTestProject();
        projectId = project.id;
    }

    const name = overrides.name || 'Test API Key';
    const key = `lp_test_${crypto.randomBytes(16).toString('hex')}`;

    // Hash API key using SHA-256 (same as apiKeysService.verifyApiKey)
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const apiKey = await db
        .insertInto('api_keys')
        .values({
            project_id: projectId,
            name,
            key_hash: keyHash,
            last_used: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return { ...apiKey, plainKey: key };
}

/**
 * Factory for creating test logs
 */
export async function createTestLog(overrides: {
    projectId?: string;
    service?: string;
    level?: 'debug' | 'info' | 'warn' | 'error' | 'critical';
    message?: string;
    metadata?: any;
    trace_id?: string;
    time?: Date;
} = {}) {
    // Create project if not provided
    let projectId = overrides.projectId;
    if (!projectId) {
        const project = await createTestProject();
        projectId = project.id;
    }

    const log = await db
        .insertInto('logs')
        .values({
            project_id: projectId,
            service: overrides.service || 'test-service',
            level: overrides.level || 'info',
            message: overrides.message || 'Test log message',
            metadata: overrides.metadata || null,
            trace_id: overrides.trace_id || null,
            time: overrides.time || new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return log;
}

/**
 * Factory for creating test Sigma rules
 */
export async function createTestSigmaRule(overrides: {
    organizationId?: string;
    projectId?: string | null;
    title?: string;
    description?: string;
    level?: string;
    enabled?: boolean;
    logsource?: any;
    detection?: any;
    emailRecipients?: string[];
    webhookUrl?: string;
    sigmaId?: string;
} = {}) {
    // Create organization if not provided
    let organizationId = overrides.organizationId;
    if (!organizationId) {
        const org = await createTestOrganization();
        organizationId = org.id;
    }

    const title = overrides.title || `Test Sigma Rule ${Date.now()}`;
    const level = overrides.level || 'medium';
    const sigmaId = overrides.sigmaId || `sigma-${crypto.randomUUID()}`;

    const sigmaRule = await db
        .insertInto('sigma_rules')
        .values({
            organization_id: organizationId,
            project_id: overrides.projectId || null,
            sigma_id: sigmaId,
            title,
            description: overrides.description || 'Test sigma rule',
            level,
            status: 'stable',
            logsource: overrides.logsource || {
                product: 'linux',
            },
            detection: overrides.detection || {
                selection: {
                    'message|contains': 'test',
                },
                condition: 'selection',
            },
            email_recipients: overrides.emailRecipients || [],
            webhook_url: overrides.webhookUrl || null,
            alert_rule_id: null,
            conversion_status: 'success',
            conversion_notes: 'Test rule created by factory',
            tags: [],
            mitre_tactics: null,
            mitre_techniques: null,
            sigmahq_path: null,
            sigmahq_commit: null,
            last_synced_at: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return sigmaRule;
}

/**
 * Factory for creating test alert rules
 */
export async function createTestAlertRule(overrides: {
    organizationId?: string;
    projectId?: string | null;
    name?: string;
    timeWindow?: number;
    threshold?: number;
    enabled?: boolean;
} = {}) {
    // Create organization if not provided
    let organizationId = overrides.organizationId;
    if (!organizationId) {
        const org = await createTestOrganization();
        organizationId = org.id;
    }

    const alertRule = await db
        .insertInto('alert_rules')
        .values({
            organization_id: organizationId,
            project_id: overrides.projectId || null,
            name: overrides.name || 'Test Alert Rule',
            service: null,
            level: ['error'],
            time_window: overrides.timeWindow || 5,
            threshold: overrides.threshold || 10,
            enabled: overrides.enabled ?? true,
            email_recipients: [],
            webhook_url: null,
            metadata: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return alertRule;
}

/**
 * Create a complete test context with user, org, project, and API key
 */
export async function createTestContext() {
    const user = await createTestUser();
    const organization = await createTestOrganization({ ownerId: user.id });
    const project = await createTestProject({ organizationId: organization.id, userId: user.id });
    const apiKey = await createTestApiKey({ projectId: project.id });

    return {
        user,
        organization,
        project,
        apiKey,
    };
}
