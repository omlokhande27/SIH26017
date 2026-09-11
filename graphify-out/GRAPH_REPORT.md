# Graph Report - landguard-ai  (2026-09-11)

## Corpus Check
- 113 files · ~99,878 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1083 nodes · 2054 edges · 68 communities (50 shown, 7 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 93 edges (avg confidence: 0.92)
- Token cost: 129,149 input · 0 output

## Community Hubs (Navigation)
- Database Regression Suite
- Schema Tables And Indexes
- Architecture And Setup Docs
- Backend Test Fixtures
- Project And Prediction Controllers
- Risk Enums And Explanation
- ML API Tests
- ML Service Routes
- ML Config And Error Handling
- Project Child-Data Service
- Rule Engine Tests
- Feature Snapshot Schema And Mapping
- Live Database Verification
- Shared Zod Validators
- Live Supabase Audit Script
- Database Package Manifest
- Snapshot Feature Derivation
- Prediction Orchestration
- Project Data Row Types
- Backend TypeScript Config
- Backend Package Manifest
- JWKS JWT Verification
- ML Model Info Endpoints
- Shared Backend Types
- ML Service HTTP Client
- Project Service And Validators
- Database TypeScript Config
- Express App And Error Middleware
- Validation Middleware And Routes
- ML Model Tests
- Model Training Pipeline
- Feature Mapper
- Backend npm Scripts
- Role Resolution And Supabase Clients
- Database Error Translation
- Authorization Guards
- Role Capability Sets
- Snapshot Feature Concepts
- Backend Dev Dependencies
- Live Prediction E2E Tests
- Test TypeScript Config
- ML Prediction Honesty
- Backend Runtime Dependencies
- Live API E2E Tests
- Migration Conventions
- Rule Engine Concepts
- REST Endpoint Documentation
- Explanation Provenance
- Dataset Provenance Honesty
- ML Baseline Limitations
- Profile Provisioning Trigger
- Prediction Assessment Migration
- Dependency Overrides
- Test Assertion Conventions
- Predictions Table
- Prediction Explanations Table
- Recommendations Table

## God Nodes (most connected - your core abstractions)
1. `translateDbError()` - 39 edges
2. `FeatureSnapshot` - 39 edges
3. `sendSuccess()` - 36 edges
4. `authorisedProjectId()` - 33 edges
5. `map_snapshot()` - 24 edges
6. `evaluate()` - 24 edges
7. `NotFoundError` - 23 edges
8. `supabaseMock` - 19 edges
9. `compilerOptions` - 18 edges
10. `public.projects` - 17 edges

## Surprising Connections (you probably didn't know these)
- `banded_rule Mutual Exclusivity` --semantically_similar_to--> `Generated Columns (GENERATED ALWAYS STORED)`  [INFERRED] [semantically similar]
  ml-service/README.md → docs/DATABASE.md
- `model_versions Registry` --conceptually_related_to--> `Nothing Is Invented To Fill A Gap`  [INFERRED]
  docs/DATABASE.md → README.md
- `ML Service API Key Requirement` --semantically_similar_to--> `Fail-Fast Environment Validation`  [INFERRED] [semantically similar]
  ml-service/README.md → backend/README.md
- `GET /health` --semantically_similar_to--> `Health And Observability`  [INFERRED] [semantically similar]
  backend/README.md → docs/ARCHITECTURE.md
- `Health And Observability` --semantically_similar_to--> `Liveness Independent Of Database Health`  [INFERRED] [semantically similar]
  docs/ARCHITECTURE.md → backend/README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Multi-Layer Data Leakage Defence** — docs_database_physical_separation, docs_database_column_boundary, docs_database_temporal_guard, docs_database_composite_fks, ml_service_readme_leakage_boundary, database_tests_leakage_test, docs_database_elapsed_time_features [EXTRACTED 1.00]
- **End-To-End Authorization Enforcement** — docs_api_authentication, docs_architecture_authorization_modules, docs_architecture_request_pipeline, docs_architecture_auth_failure_modes, docs_database_row_level_security, docs_database_rls_not_sufficient, docs_architecture_service_role_usage [EXTRACTED 1.00]
- **Never Fabricate A Value** — readme_no_fabricated_values, docs_database_null_not_zero, ml_service_readme_median_baseline, ml_service_requirements_no_shap, ml_service_data_readme_provenance_labels, database_tests_seed_test, docs_api_snapshot_refusal, ml_service_readme_feature_mapper [INFERRED 0.95]

## Communities (68 total, 7 thin omitted)

### Community 0 - "Database Regression Suite"
Cohesion: 0.07
Nodes (51): Migration 0002 prediction_result_matches_status, createBareDb(), createSchemaDb(), createSeededDb(), DATABASE_DIR, Db, expectSqlError(), GRANTS_SQL (+43 more)

### Community 1 - "Schema Tables And Indexes"
Cohesion: 0.07
Nodes (51): auth.users, idx_actual_outcomes_project, idx_assignments_user, idx_explanations_prediction_rank, idx_legal_issues_project, idx_legal_issues_severity, idx_legal_issues_status, idx_predictions_created (+43 more)

### Community 2 - "Architecture And Setup Docs"
Cohesion: 0.05
Nodes (50): Express + TypeScript Backend, Environment-Sourced Credentials, Fail-Fast Environment Validation, GET /health, Liveness Independent Of Database Health, Migration 0003 auto_provision_profiles, PGlite Test Engine, Database Regression Suite (+42 more)

### Community 3 - "Backend Test Fixtures"
Cohesion: 0.09
Nodes (27): authHeader(), ISSUER, PROJECTS, SECRET, seedCompensation(), seedLandAcquisition(), seedStandardFixture(), tokenFor() (+19 more)

### Community 4 - "Project And Prediction Controllers"
Cohesion: 0.16
Nodes (37): createPrediction(), getAssessment(), getLatestPrediction(), listPredictions(), authorisedProjectId(), callerOf(), createProject(), deleteProject() (+29 more)

### Community 5 - "Risk Enums And Explanation"
Cohesion: 0.09
Nodes (31): Enum, str, RiskLevel, Severity, build(), Plain-language explanation of an assessment. Assembled deterministically from…, MappedFeatures, Any (+23 more)

### Community 6 - "ML API Tests"
Cohesion: 0.06
Nodes (9): parametrize, HTTP surface: authentication, contracts, and error handling. The service is…, TestAuthentication, TestFeatureMappingEndpoint, TestLeakageAtTheApiBoundary, TestModelInfo, TestPredict, TestRuleEndpoints (+1 more)

### Community 7 - "ML Service Routes"
Cohesion: 0.13
Nodes (32): BaseModel, _coverage(), evaluate_rules(), _limitations(), predict(), HTTP surface of the ML service. The Node backend is the only intended caller.…, Rule engine only — no model involved., Actions for whatever fired. Empty when nothing fired. (+24 more)

### Community 8 - "ML Config And Error Handling"
Cohesion: 0.07
Nodes (24): BaseSettings, Exception, exception_handler, JSONResponse, Shared-secret check. When no key is configured the service is open — acceptable…, require_api_key(), get_settings(), Service configuration. Secrets come from the environment, never from source. (+16 more)

### Community 9 - "Project Child-Data Service"
Cohesion: 0.13
Nodes (29): ChildTable, COLUMNS_FOR, createChild(), createCompensation(), createLandAcquisition(), createLegalIssue(), createRiskFactor(), deleteChild() (+21 more)

### Community 10 - "Rule Engine Tests"
Cohesion: 0.11
Nodes (7): evaluate(), Rule engine behaviour. The properties that matter most are the ones that would…, TestCategories, TestEvidenceAndDeterminism, TestMissingData, TestNoDoubleCounting, TestRiskBands

### Community 11 - "Feature Snapshot Schema And Mapping"
Cohesion: 0.15
Nodes (12): field_validator, FeatureSnapshot, The ML input record — mirrors `public.project_feature_snapshots` exactly.…, map_snapshot(), Translate a database snapshot into rule-engine inputs. Nothing is imputed. A…, parametrize, Feature mapper: the boundary where a snapshot becomes rule-engine input. The…, TestDerivedMappings (+4 more)

### Community 12 - "Live Database Verification"
Cohesion: 0.18
Nodes (26): anon, byRole(), check(), cleanup(), clientForToken(), createTestUser(), EXPECTED_TABLES, group() (+18 more)

### Community 13 - "Shared Zod Validators"
Cohesion: 0.09
Nodes (21): decimalString(), ISSUE_STATUSES, LEGAL_ISSUE_TYPES, longText(), nonNegativeInt(), Pagination, paginationQuery, PAYMENT_STATUSES (+13 more)

### Community 14 - "Live Supabase Audit Script"
Cohesion: 0.11
Nodes (19): describeKey(), main(), record(), results, Status, summarise(), baseSchema, envSchema (+11 more)

### Community 15 - "Database Package Manifest"
Cohesion: 0.08
Nodes (23): description, devDependencies, @electric-sql/pglite, @types/node, typescript, vitest, @types/node, typescript (+15 more)

### Community 16 - "Snapshot Feature Derivation"
Cohesion: 0.13
Nodes (21): asOfDate(), assessSnapshotQuality(), BLOCKING(), CompensationSource, daysBetween(), deriveSnapshotFeatures(), isActive(), IssueSeverity (+13 more)

### Community 17 - "Prediction Orchestration"
Cohesion: 0.16
Nodes (19): TriggeredRule, AssessmentResponse, buildAssessment(), ensureModelVersion(), getLatestPrediction(), getStoredAssessment(), limitationFlags(), listPredictions() (+11 more)

### Community 18 - "Project Data Row Types"
Cohesion: 0.20
Nodes (19): CompensationRow, getCompensation(), LandAcquisitionRow, LegalIssueRow, listChildren(), listLegalIssues(), listRiskFactors(), RiskFactorRow (+11 more)

### Community 19 - "Backend TypeScript Config"
Cohesion: 0.10
Nodes (20): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, noFallthroughCasesInSwitch (+12 more)

### Community 20 - "Backend Package Manifest"
Cohesion: 0.11
Nodes (18): author, description, @types/node, typescript, vitest, keywords, license, main (+10 more)

### Community 21 - "JWKS JWT Verification"
Cohesion: 0.14
Nodes (12): SUPABASE_JWKS_URL, getJwks(), HS_ALGORITHMS, JWKS_ALGORITHMS, JwksProbe, JwtConfigurationError, JwtMode, probeJwks() (+4 more)

### Community 22 - "ML Model Info Endpoints"
Cohesion: 0.14
Nodes (13): feature_mapping(), health(), model_info(), get, Liveness. Unauthenticated on purpose so an orchestrator can probe it. Reports…, The snapshot -> rule-engine mapping table, as data. Exposed so the mapping can…, load(), load_error() (+5 more)

### Community 23 - "Shared Backend Types"
Cohesion: 0.20
Nodes (9): AppRole, ResolvedProfile, ApiResponse, AuthenticatedUser, PaginationQuery, mockNext(), mockRequest(), mockResponse (+1 more)

### Community 24 - "ML Service HTTP Client"
Cohesion: 0.16
Nodes (15): callMlService(), evaluateRules(), getModelInfo(), getRecommendations(), MLEstimate, MlServiceHealth, ModelInfo, predict() (+7 more)

### Community 25 - "Project Service And Validators"
Cohesion: 0.14
Nodes (14): assignedProjectIds(), createProject(), listProjects(), PaginatedProjects, isoDate(), PROJECT_STATUSES, shortText(), CreateProjectInput (+6 more)

### Community 26 - "Database TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noEmit, noUncheckedIndexedAccess (+8 more)

### Community 27 - "Express App And Error Middleware"
Cohesion: 0.18
Nodes (11): app, env, supabase, errorMiddleware(), router, router, server, checkDatabase() (+3 more)

### Community 28 - "Validation Middleware And Routes"
Cohesion: 0.15
Nodes (13): Target, validate(), CreatePredictionInput, createPredictionSchema, createLegalIssueSchema, createRiskFactorSchema, updateCompensationSchema, updateLandAcquisitionSchema (+5 more)

### Community 29 - "ML Model Tests"
Cohesion: 0.14
Nodes (5): card(), fixture, Model artifact, leakage protection, and honest labelling. The leakage tests are…, TestModelLoading, TestNoTargetLeakage

### Community 30 - "Model Training Pipeline"
Cohesion: 0.24
Nodes (13): candidates(), evaluate(), groups_for(), load(), main(), Any, DataFrame, Training — and an honest evaluation of whether the result is worth anything.… (+5 more)

### Community 31 - "Feature Mapper"
Cohesion: 0.16
Nodes (9): mapping_documentation(), MappingKind, MappingRule, Enum, str, Feature mapping layer: database snapshot -> rule engine inputs.…, The mapping table as data, for /model-info and the docs., One documented mapping from the snapshot to a rule-engine input. (+1 more)

### Community 32 - "Backend npm Scripts"
Cohesion: 0.15
Nodes (13): scripts, audit:supabase, build, dev, start, test, test:live, test:live:ml (+5 more)

### Community 33 - "Role Resolution And Supabase Clients"
Cohesion: 0.23
Nodes (10): isAppRole(), normalizeRole(), supabaseAdmin, authMiddleware, forbidden(), requireAuth(), RFC-4122, unauthorized() (+2 more)

### Community 34 - "Database Error Translation"
Cohesion: 0.17
Nodes (9): CONSTRAINT_MESSAGES, constraintName(), FOREIGN_KEY_MESSAGES, NO_ROWS_CODES, PostgresErrorLike, SCHEMA_MISSING_CODES, SQLSTATE, TranslateOptions (+1 more)

### Community 35 - "Authorization Guards"
Cohesion: 0.27
Nodes (11): forbidden(), ProjectAccessOptions, requireProjectAccess(), requireProjectRead(), requireProjectWrite(), requireRole(), RFC-4122, unauthenticated() (+3 more)

### Community 36 - "Role Capability Sets"
Cohesion: 0.27
Nodes (9): APP_ROLES, ROLES_WITH_ASSIGNED_WRITE, ROLES_WITH_GLOBAL_READ, ROLES_WITH_GLOBAL_WRITE, ROLES_WITH_SYSTEM_ADMIN, AccessDecision, canAccessProject(), isAssignedToProject() (+1 more)

### Community 37 - "Snapshot Feature Concepts"
Cohesion: 0.18
Nodes (11): The 21 Snapshot Features, data_quality Computed Not Stored, Feature Snapshot Endpoints, Snapshot Immutability At Every Layer, Snapshot Refusal (422), Elapsed-Time Features Are Inputs, Not Targets, The Feature Snapshot Concept, Index Strategy (+3 more)

### Community 38 - "Backend Dev Dependencies"
Cohesion: 0.20
Nodes (10): devDependencies, supertest, ts-node-dev, @types/cors, @types/express, @types/jsonwebtoken, @types/node, @types/supertest (+2 more)

### Community 39 - "Live Prediction E2E Tests"
Cohesion: 0.20
Nodes (6): actors, projectIds, Role, RUN, secret, @supabase/supabase-js

### Community 40 - "Test TypeScript Config"
Cohesion: 0.20
Nodes (9): compilerOptions, module, moduleResolution, noEmit, rootDir, types, extends, include (+1 more)

### Community 41 - "ML Prediction Honesty"
Cohesion: 0.29
Nodes (5): estimate(), DataFrame, MLEstimate, _snapshot_to_model_row(), TestPredictionHonesty

### Community 42 - "Backend Runtime Dependencies"
Cohesion: 0.22
Nodes (9): dependencies, axios, cors, dotenv, express, jose, jsonwebtoken, @supabase/supabase-js (+1 more)

### Community 43 - "Live API E2E Tests"
Cohesion: 0.22
Nodes (6): Actor, actors, createdProjectIds, Role, RUN, secret

### Community 44 - "Migration Conventions"
Cohesion: 0.22
Nodes (9): schema.sql As Canonical Baseline, Applied Migrations Are Immutable, Migration Convention, Adding A Risk Factor Type Is Not A Migration, Risk Factors Endpoints, Assumptions And Deviations From The Brief, Why 0 Is The Worst Available Placeholder, risk_factor_types Lookup Table (+1 more)

### Community 45 - "Rule Engine Concepts"
Cohesion: 0.25
Nodes (9): assessment_complete Flag, banded_rule Mutual Exclusivity, Feature Mapper, FastAPI ML Service, Risk Score Formula, Rule Engine, Assessment Sufficiency Check, ML Service Dependency Set (+1 more)

### Community 46 - "REST Endpoint Documentation"
Cohesion: 0.31
Nodes (9): Compensation Endpoint, GET /api/projects/:projectId/full, Land Acquisition Endpoint, Legal Issues Endpoints, Projects Endpoints, compensation Table, Generated Columns (GENERATED ALWAYS STORED), land_acquisition Table (+1 more)

### Community 47 - "Explanation Provenance"
Cohesion: 0.33
Nodes (6): Migration 0004 prediction_assessment_fields, Assessments Are Read Back, Never Recomputed, Deliberately Absent Routes, Attribution Is Not Causal Proof, prediction_explanations Table, shap Deliberately Not Installed

### Community 48 - "Dataset Provenance Honesty"
Cohesion: 0.40
Nodes (6): The Two Signals Are Never Merged, combined5_land_acquisition.csv, ML Datasets And Provenance, neededfactors.csv, Honesty / Provenance Columns, Categories Are Never Mixed

### Community 49 - "ML Baseline Limitations"
Cohesion: 0.40
Nodes (6): model_versions Registry, Dataset Degeneracy (130 Rows, 22 Vectors), Grouped Cross-Validation, BASELINE_MEDIAN Prediction, xgboost / lightgbm Deliberately Not Installed, The ML Claim Matches The Evidence

## Knowledge Gaps
- **229 isolated node(s):** `name`, `version`, `description`, `main`, `dev` (+224 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 426 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `Project And Prediction Controllers` to `Role Resolution And Supabase Clients`, `Authorization Guards`, `Backend Package Manifest`, `Shared Backend Types`, `Express App And Error Middleware`, `Validation Middleware And Routes`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `supabaseMock` connect `Backend Test Fixtures` to `Shared Backend Types`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `env` connect `Express App And Error Middleware` to `Role Resolution And Supabase Clients`, `Live Database Verification`, `Live Supabase Audit Script`, `JWKS JWT Verification`, `ML Service HTTP Client`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `FeatureSnapshot` (e.g. with `estimate()` and `_snapshot_to_model_row()`) actually correct?**
  _`FeatureSnapshot` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _229 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Database Regression Suite` be split into smaller, more focused modules?**
  _Cohesion score 0.06547619047619048 - nodes in this community are weakly interconnected._
- **Should `Schema Tables And Indexes` be split into smaller, more focused modules?**
  _Cohesion score 0.06883116883116883 - nodes in this community are weakly interconnected._