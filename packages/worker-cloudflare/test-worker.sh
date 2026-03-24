#!/bin/bash
# Worker 测试脚本

set -e

BASE_URL=${1:-"http://localhost:8787"}

echo "=========================================="
echo "Gradience Worker Test Suite"
echo "Base URL: $BASE_URL"
echo "=========================================="

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 测试计数
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
run_test() {
    local name=$1
    local command=$2
    
    echo -n "Testing $name... "
    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
    fi
}

# 1. Health Check
echo ""
echo "1. Health Check"
echo "---------------"
run_test "health endpoint" "curl -sf $BASE_URL/health"
HEALTH_RESPONSE=$(curl -sf $BASE_URL/health 2>/dev/null || echo "{}")
echo "Response: $HEALTH_RESPONSE"

# 2. Task Execution (Mock)
echo ""
echo "2. Task Execution (Mock Mode)"
echo "-----------------------------"
run_test "execute endpoint" "curl -sf -X POST $BASE_URL/execute -H 'Content-Type: application/json' -d '{\"taskId\": \"test-$(date +%s)\", \"workflowHash\": \"mock\"}'"
EXECUTE_RESPONSE=$(curl -sf -X POST $BASE_URL/execute -H 'Content-Type: application/json' -d '{"taskId": "test-'$(date +%s)'", "workflowHash": "mock"}' 2>/dev/null || echo "{}")
echo "Response: $EXECUTE_RESPONSE"

# 获取任务ID
TASK_ID=$(echo "$EXECUTE_RESPONSE" | grep -o '"taskId":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "null" ]; then
    echo "Created task: $TASK_ID"
    
    # 3. Task Status
    echo ""
    echo "3. Task Status"
    echo "--------------"
    sleep 2
    run_test "get task status" "curl -sf $BASE_URL/tasks/$TASK_ID"
    STATUS_RESPONSE=$(curl -sf $BASE_URL/tasks/$TASK_ID 2>/dev/null || echo "{}")
    echo "Response: $STATUS_RESPONSE"
else
    echo "No task ID returned, skipping status test"
fi

# 4. Error Handling
echo ""
echo "4. Error Handling"
echo "-----------------"
run_test "404 response" "curl -sf -w '%{http_code}' $BASE_URL/nonexistent | grep -q '404'"
run_test "missing params (400)" "curl -sf -w '%{http_code}' -X POST $BASE_URL/execute -H 'Content-Type: application/json' -d '{}' | grep -q '400'"

# 总结
echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
fi
