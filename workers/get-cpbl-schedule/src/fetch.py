import json
import os

# ==========================================
# 1. 配置区域 (Configuration)
# ==========================================
# 输入与输出文件名
INPUT_FILE_NAME = "raw_response.json"
OUTPUT_FILE_NAME = "cleaned_result.json"

# 需要提取的字段列表
TARGET_FIELDS = [
    "KindCode",
    "GameDate",
    "GameDateTimeS",
    "HomeTeamName",
    "HomeScore",
    "VisitingTeamName",
    "VisitingScore"
]

# 赛事类型映射表 (Mapping)
KIND_CODE_MAP = {
    "A": "一军例行赛 (Regular Season)",
    "B": "明星赛",
    "C": "总冠军赛",
    "D": "季后挑战赛",
    "E": "热身赛"
}


# ==========================================
# 2. 核心处理函数 (Core Logic)
# ==========================================
def clean_match_data(json_data, fields_to_keep):
    """
    清洗数据，提取指定字段，并应用映射逻辑。
    """
    cleaned_list = []

    # 简单的容错处理
    if not isinstance(json_data, list):
        if isinstance(json_data, dict) and 'data' in json_data:
            json_data = json_data['data']
        else:
            print("❌ 错误: JSON数据格式不是列表 (List)，无法处理。")
            return []

    for item in json_data:
        cleaned_item = {}

        for field in fields_to_keep:
            # 1. 获取原始值 (如果不存在则为 None)
            original_value = item.get(field)

            # 2. 应用映射逻辑 (Mapping Logic)
            final_value = original_value

            # 如果是 KindCode 字段，且值在映射表中，则进行替换
            if field == "KindCode" and original_value in KIND_CODE_MAP:
                final_value = KIND_CODE_MAP[original_value]

            # 3. 存入结果字典
            cleaned_item[field] = final_value

        cleaned_list.append(cleaned_item)

    return cleaned_list


# ==========================================
# 3. 主程序 (Main Execution)
# ==========================================
def main():
    # 获取脚本所在的当前目录绝对路径
    current_dir = os.path.dirname(os.path.abspath(__file__))

    input_path = os.path.join(current_dir, INPUT_FILE_NAME)
    output_path = os.path.join(current_dir, OUTPUT_FILE_NAME)

    # --- 步骤 1: 检查输入文件 ---
    if not os.path.exists(input_path):
        print(f"❌ 错误: 未找到输入文件: {INPUT_FILE_NAME}")
        return

    try:
        # --- 步骤 2: 读取数据 ---
        print(f"📂 正在读取: {INPUT_FILE_NAME} ...")
        with open(input_path, 'r', encoding='utf-8') as f:
            raw_data = json.load(f)

        # --- 步骤 3: 清洗与映射 ---
        cleaned_data = clean_match_data(raw_data, TARGET_FIELDS)
        print(f"✅ 处理完成，共清洗 {len(cleaned_data)} 条数据。")

        # --- 步骤 4: 保存结果 ---
        print(f"💾 正在保存到: {OUTPUT_FILE_NAME} ...")
        with open(output_path, 'w', encoding='utf-8') as f_out:
            json.dump(cleaned_data, f_out, indent=4, ensure_ascii=False)

        print(f"🎉 成功！\n文件路径: {output_path}")

    except json.JSONDecodeError:
        print("❌ 错误: 输入文件不是有效的 JSON 格式。")
    except Exception as e:
        print(f"❌ 发生未知错误: {e}")


if __name__ == "__main__":
    main()