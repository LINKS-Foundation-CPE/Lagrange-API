#!/usr/bin/env bash
# Seed a development quantum-api instance with an organization, a project,
# and test users, going through the real API (so vault projects, budget
# events, and role logic behave exactly as in production).
#
# Prerequisites:
#   - quantum-api running (default http://127.0.0.1:8500)
#   - a reachable Keycloak realm with:
#       * a public client with Direct Access Grants (password grant) enabled
#       * an admin test user holding the realm role `platform-admin`
#       * a regular test user
#   - both users' passwords known (this is a DEV tool; never point it at prod)
#
# Usage (all parameters via env vars, sane dev defaults):
#   KEYCLOAK_URL=http://<host>:<port> \
#   KEYCLOAK_REALM=cortex \
#   KEYCLOAK_CLIENT=test-frontend \
#   ADMIN_USER=testadmin ADMIN_PASS=... \
#   TEST_USER=testuser  TEST_PASS=... \
#   MANAGER_USER=testmanager MANAGER_PASS=... \   # optional org-manager
#   PI_USER=testpi        PI_PASS=... \           # optional project admin (PI)
#   ./scripts/dev-seed.sh
#
# The org-manager and PI are only provisioned when their passwords are set,
# so the script still runs with just the admin + regular user.
#
# Idempotency: safe to re-run; creation steps that hit uniqueness errors are
# reported and skipped.

set -euo pipefail

API_URL=${API_URL:-https://127.0.0.1:8500}
KEYCLOAK_URL=${KEYCLOAK_URL:?set KEYCLOAK_URL (e.g. http://host:8960)}
KEYCLOAK_REALM=${KEYCLOAK_REALM:-cortex}
KEYCLOAK_CLIENT=${KEYCLOAK_CLIENT:-test-frontend}
ADMIN_USER=${ADMIN_USER:-testadmin@example.com}
ADMIN_PASS=${ADMIN_PASS:?set ADMIN_PASS}
TEST_USER=${TEST_USER:-testuser@example.com}
TEST_PASS=${TEST_PASS:?set TEST_PASS}
MANAGER_USER=${MANAGER_USER:-testmanager@example.com}
MANAGER_PASS=${MANAGER_PASS:-}                     # optional: org-manager
PI_USER=${PI_USER:-testpi@example.com}
PI_PASS=${PI_PASS:-}                               # optional: project admin (PI)

ORG_NAME=${ORG_NAME:-DevOrg}
ORG_BUDGET_HOURS=${ORG_BUDGET_HOURS:-100}          # hours -> vault budget
PROJECT_NAME=${PROJECT_NAME:-dev-project}
PROJECT_BUDGET_HOURS=${PROJECT_BUDGET_HOURS:-10}   # hours, drawn from the org vault

TOKEN_ENDPOINT="${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token"

json() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d$1)"; }

kc_token() { # $1=user $2=pass -> access token on stdout
  curl -skf "${TOKEN_ENDPOINT}" \
    -d grant_type=password -d client_id="${KEYCLOAK_CLIENT}" \
    -d username="$1" --data-urlencode password="$2" \
    | json "['access_token']"
}

backend_token() { # $1=keycloak access token -> backend JWT (also provisions the user row)
  curl -skf -X POST "${API_URL}/auth/token" -H "Authorization: Bearer $1" \
    | json "['token']"
}

api() { # $1=token $2=method $3=path $4=json-body(optional)
  if [ -n "${4:-}" ]; then
    curl -sk -X "$2" "${API_URL}$3" -H "Authorization: Bearer $1" \
      -H "Content-Type: application/json" -d "$4"
  else
    curl -sk -X "$2" "${API_URL}$3" -H "Authorization: Bearer $1"
  fi
}

echo "→ Keycloak login: ${ADMIN_USER} @ ${KEYCLOAK_REALM}"
KC_ADMIN=$(kc_token "${ADMIN_USER}" "${ADMIN_PASS}")
echo "→ Exchanging for backend JWT (provisions ${ADMIN_USER} in the DB)"
BE_ADMIN=$(backend_token "${KC_ADMIN}")

echo "→ Provisioning ${TEST_USER} in the DB (login + exchange)"
KC_USER=$(kc_token "${TEST_USER}" "${TEST_PASS}")
BE_USER=$(backend_token "${KC_USER}")

echo "→ Creating organization '${ORG_NAME}' (vault: ${ORG_BUDGET_HOURS} h)"
ORG=$(api "${BE_ADMIN}" POST /api/organizations \
  "{\"name\":\"${ORG_NAME}\",\"free_queue\":false,\"initial_budget\":${ORG_BUDGET_HOURS}}")
echo "  ${ORG}"
ORG_ID=$(echo "${ORG}" | json "['id']" 2>/dev/null) || {
  echo "  (organization may already exist — looking it up)"
  ORG_ID=$(api "${BE_ADMIN}" GET "/api/organizations" \
    | python3 -c "import json,sys;print([o['id'] for o in json.load(sys.stdin) if o['name']=='${ORG_NAME}'][0])")
}
echo "  organization id: ${ORG_ID}"

echo "→ Creating project '${PROJECT_NAME}' (budget ${PROJECT_BUDGET_HOURS} h from vault)"
PROJ=$(api "${BE_ADMIN}" POST /api/projects \
  "{\"name\":\"${PROJECT_NAME}\",\"organization_id\":${ORG_ID},\"budget\":${PROJECT_BUDGET_HOURS}}")
echo "  ${PROJ}"
PROJ_ID=$(echo "${PROJ}" | json "['id']" 2>/dev/null) || {
  echo "  (project may already exist — looking it up)"
  PROJ_ID=$(api "${BE_ADMIN}" GET "/api/projects" \
    | python3 -c "import json,sys;print([p['id'] for p in json.load(sys.stdin) if p['name']=='${PROJECT_NAME}'][0])")
}
echo "  project id: ${PROJ_ID}"

for u in "${ADMIN_USER}" "${TEST_USER}"; do
  # user emails follow Keycloak; the backend matched/created rows by email at /auth/token
  EMAIL=$(api "${BE_ADMIN}" GET "/api/users" \
    | python3 -c "import json,sys;us=json.load(sys.stdin);print([x['email'] for x in us if x['email'].startswith('${u}')][0])")
  echo "→ Adding ${EMAIL} to project ${PROJ_ID}"
  api "${BE_ADMIN}" POST "/api/projects/${PROJ_ID}/users" \
    "{\"email\":\"${EMAIL}\",\"admin\":false}" ; echo
done

echo "→ Setting default project for ${TEST_USER}"
api "${BE_USER}" PUT /api/own/default_project "{\"default_project_id\":${PROJ_ID}}"; echo

user_id_by_email() { # $1=email(-prefix) -> DB user id on stdout
  api "${BE_ADMIN}" GET "/api/users" \
    | python3 -c "import json,sys;us=json.load(sys.stdin);print([x['id'] for x in us if x['email'].startswith('$1')][0])"
}

# Optional: org-manager for DevOrg (only when a password is supplied).
if [ -n "${MANAGER_PASS}" ]; then
  echo "→ Provisioning org-manager ${MANAGER_USER} (login + exchange)"
  KC_MANAGER=$(kc_token "${MANAGER_USER}" "${MANAGER_PASS}")
  backend_token "${KC_MANAGER}" >/dev/null   # creates the DB row
  MANAGER_ID=$(user_id_by_email "${MANAGER_USER}")
  echo "  manager id: ${MANAGER_ID}; assigning org ${ORG_ID} + organization_manager"
  api "${BE_ADMIN}" PUT "/api/users/${MANAGER_ID}" \
    "{\"organization_id\":${ORG_ID},\"organization_manager\":true}" ; echo
else
  echo "→ (skipping org-manager: MANAGER_PASS not set)"
fi

# Optional: PI (project admin) added to the project (only when a password is supplied).
if [ -n "${PI_PASS}" ]; then
  echo "→ Provisioning PI ${PI_USER} (login + exchange)"
  KC_PI=$(kc_token "${PI_USER}" "${PI_PASS}")
  backend_token "${KC_PI}" >/dev/null        # creates the DB row
  PI_EMAIL=$(api "${BE_ADMIN}" GET "/api/users" \
    | python3 -c "import json,sys;us=json.load(sys.stdin);print([x['email'] for x in us if x['email'].startswith('${PI_USER}')][0])")
  echo "→ Adding ${PI_EMAIL} to project ${PROJ_ID} as admin (PI)"
  api "${BE_ADMIN}" POST "/api/projects/${PROJ_ID}/users" \
    "{\"email\":\"${PI_EMAIL}\",\"admin\":true}" ; echo
else
  echo "→ (skipping PI: PI_PASS not set)"
fi

echo
echo "✅ Seed complete. Quick check — jobAuthorizer for ${TEST_USER}:"
curl -sk -X POST "${API_URL}/jobAuthorizer" -H "Authorization: Bearer ${KC_USER}" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${TEST_USER}\"}"
echo
