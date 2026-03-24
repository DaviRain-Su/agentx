#!/bin/bash
# gstack 快速测试脚本

echo "🧪 测试 gstack 安装..."
echo ""

# 检查目录结构
echo "📁 检查目录结构..."
if [ -d ".pi/skills/gstack" ]; then
    echo "  ✅ gstack 目录存在"
else
    echo "  ❌ gstack 目录不存在"
    exit 1
fi

# 检查二进制文件
echo ""
echo "🔧 检查二进制文件..."
if [ -f ".pi/skills/gstack/bin/gstack-config" ]; then
    echo "  ✅ gstack-config 存在"
else
    echo "  ❌ gstack-config 不存在"
    exit 1
fi

if [ -f ".pi/skills/gstack/browse/dist/browse" ]; then
    echo "  ✅ browse 二进制存在"
else
    echo "  ❌ browse 二进制不存在"
    exit 1
fi

# 检查生成的技能
echo ""
echo "📚 检查生成的技能..."
SKILL_COUNT=$(ls -1 .pi/skills/gstack/.agents/skills/ 2>/dev/null | wc -l)
if [ "$SKILL_COUNT" -gt 0 ]; then
    echo "  ✅ 生成了 $SKILL_COUNT 个技能"
    echo "  技能列表:"
    ls -1 .pi/skills/gstack/.agents/skills/ | sed 's/^/    - /'
else
    echo "  ❌ 没有生成技能"
    exit 1
fi

# 检查核心技能文件
echo ""
echo "📝 检查核心技能文件..."
CORE_SKILLS=("office-hours" "review" "qa" "ship" "plan-ceo-review" "plan-eng-review")
for skill in "${CORE_SKILLS[@]}"; do
    if [ -f ".pi/skills/gstack/.agents/skills/gstack-$skill/SKILL.md" ]; then
        echo "  ✅ gstack-$skill"
    else
        echo "  ❌ gstack-$skill 缺失"
    fi
done

echo ""
echo "🎉 gstack 安装测试完成！"
echo ""
echo "使用方法:"
echo "  在 pi 交互界面中输入: /office-hours"
echo "  或带参数: /office-hours 我想设计一个去中心化协议"
