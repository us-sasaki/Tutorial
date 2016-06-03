import java.util.List;

/** 各種処理用に便利な値を追加. keyはpath */
public class FileEntry {
	String		path;
	int			level;		// 深さ
	boolean		isDirectory; // ディレクトリか？
	List<Long>	sizeList;	// 過去のサイズ履歴
	long		size;
	long		increase;	// 直近の増分
	String		owner	= "unknown";		// ファイル所有者
}
