import java.util.*;
import java.io.*;
import java.text.SimpleDateFormat;

/**
 * 複数回のディレクトリ内ファイルサイズ情報を元に沢山容量を消費している
 * ファイルを抽出する。
 */
public class FileList {
	public static int MAX_DEPTH = FileLister.MAX_DEPTH;
	
	
	static SimpleDateFormat	sdf = new SimpleDateFormat("yyyyMMdd");
	
	List<Long>		dateList;
	List<FileEntry> list;
	int sizeListCount;
	
/*-------------
 * constructor
 */
	/**
	 * 空の FileList を作ります。
	 */
	public FileList() {
		list = null;
		dateList = null;
		sizeListCount = 0;
	}
	
/*------------------
 * instance methods
 */
	/**
	 * 試験用に作ったもの。今後はlistyyyyMMdd.csv 形式のものを呼ぶように変更
	 * ファイル名から、いつの情報かを取得する必要があるため。
	 * FileMapper も不要になりそう
	 *
	 * @deprecated
	 */
	public void readFile(String fname) throws IOException {
		if (list != null) throw new IllegalStateException("すでに値を保持しています");
		list = new ArrayList<FileEntry>();
		
		FileReader fr = new FileReader(fname);
		BufferedReader br = new BufferedReader(fr);
		
		int maxTokens = 0;
		while (true) {
			String line = br.readLine();
			if ( (line == null)||(line.equals("")) ) break;
			
			String[] token = line.split(",");
			
			// ファイルサイズが途中で切れることがあるため、最大値を取得
			if (token.length > maxTokens) maxTokens = token.length;
			
			// FileEntry に変換する
			FileEntry entry = new FileEntry();
			
			entry.level = Integer.parseInt(token[0]);
			String p = "";
			for (int i = 1; i <= MAX_DEPTH; i++) {
				if (token[i].equals("")) continue;
				if (i > 1) p = p + "\\";
				p = p + token[i];
			}
			entry.path = p;
			entry.isDirectory = false; // ちゃんと処理してない
			entry.sizeList = new ArrayList<Long>();
			
			boolean hasSize  = false;
			boolean hasOwner = false;
			
			for (int i = MAX_DEPTH+1; i < token.length; i++) {
				if (token[i].equals("")) token[i] = "0";
				try {
					entry.sizeList.add(Long.decode(token[i]));
					if (i == token.length - 1) hasSize = true;
				} catch (NumberFormatException e) {
					if (i == token.length - 1) {
						entry.owner = token[i];
						hasOwner = true;
					}
					else throw new NumberFormatException(e.getMessage());
				}
			}
			// 最後の成分が長さの場合、文字列の場合の両方を含むとエラー
			if (hasSize&&hasOwner) throw new NumberFormatException("フォーマットエラー");
			
			List<Long> l = entry.sizeList;
			entry.size	= l.get(l.size() - 1);
			if (l.size() == 1) {
				entry.increase = entry.size;
			} else {
				entry.increase = entry.size - l.get(l.size() - 2);
			}
			
			list.add(entry);
		}
		
		sizeListCount = maxTokens - MAX_DEPTH - 1;
		
		fr.close();
		br.close();
		// isDirectory の設定
		// アルゴリズム
		//   同一のpath文字列を含む他の Entry があれば directory
		//   まず path について辞書式にならべるとすぐわかりそう
		makeup(); // sizeList の長さをそろえ、isDirectoryを設定
	}
	
	public void addDateList(String filename) {
		if (dateList == null) dateList = new ArrayList<Long>();
		try {
			long date = sdf.parse(filename.substring(4,12)).getTime();
			dateList.add(date);
		} catch (java.text.ParseException pe) {
			throw new RuntimeException(pe.toString());
		}
	}
	
	/**
	 * listyyyyMMdd.csv 形式(FileLister2 で生成)のファイルの情報を読み込みます。
	 */
	public void addFile(String fname) throws IOException {
		if (list == null) list = new ArrayList<FileEntry>();
		
		// 遅いため、内部処理で Map を使う実装に変更
		Map<String, FileEntry> map = new TreeMap<String, FileEntry>();
		for (FileEntry fe : list) map.put(fe.path, fe);
		
		FileReader		fr	= new FileReader(fname);
		BufferedReader	br	= new BufferedReader(fr);
		
		while (true) {
			String line = br.readLine();
			if ( (line == null)||(line.equals("")) ) break;
			
			String[] token = line.split(",");
			
			// まず path を生成する
			String p = "";
			for (int i = 1; i <= MAX_DEPTH; i++) {
				if (token[i].equals("")) continue;
				if (i > 1) p = p + "\\";
				p = p + token[i];
			}
			
			FileEntry entry = map.get(p);
			if (entry == null) {
				// 新しい path
				entry = new FileEntry();
				map.put(p, entry); // entry の参照だけ先に登録、中身は以降変更
				
				entry.level = Integer.parseInt(token[0]);
				entry.path = p;
				entry.isDirectory = false; // ちゃんと処理してない
				entry.sizeList = new ArrayList<Long>();
				for (int i = 0; i < sizeListCount; i++) {
					entry.sizeList.add(0L);
				}
			}
			entry.sizeList.add(Long.decode(token[MAX_DEPTH + 1]));
			
			// increase は１つ前のものとの差分を取っているが、
			// 今後、指定できるようにする
			List<Long> l = entry.sizeList;
			entry.size	= l.get(l.size() - 1); // 最後(最新)のサイズ
			if (l.size() == 1) {
				entry.increase = entry.size;
			} else {
				entry.increase = entry.size - l.get(l.size() - 2);
			}
		}
		
		sizeListCount++;
		
		fr.close();
		br.close();
		
		// map を list に再設定
		list.clear();
		for (FileEntry entry : map.values()) {
			list.add(entry);
		}
		
		// sizeList の長さをそろえ、isDirectory を設定
		makeup();
		
		// ファイル名から、date を取得
		addDateList(fname);
	}
	
	/**
	 * list を path の辞書式順序に整列し、
	 * sizeList の長さを sizeListCount (addFile した回数) に揃え、
	 * 各 FileEntry の isDirectory フラグを設定する。このフラグ設定は、
	 * path の辞書式順に並べたとき、自分以降に自分を含む path が存在
	 * しない場合にファイル(isDirectory = false)としている。<BR>
	 * 例)												<br>
	 * path1 = Y:\hoge\tarou.hoe						<br>
	 * path2 = Y:\hoge\tarou.hoe\bar					<br>
	 * path3 = Y:\hoge\tarou.hoe\foo					<br>
	 * path4 =(Y:\hoge\tarou.hoe\foo で始まらないもの)	<br>
	 *
	 * のようになっていた場合、path1 のみ directory, path2/3 は file と判定する
	 * つまり、空のディレクトリはファイルと判定される弊害があるが、path のみから
	 * directory を判定する手段はなく、このファイル(ディレクトリ)は常にサイズが0
	 * なので、後続処理に影響しないため、問題ない。
	 */
	private void makeup() {
		// path の辞書式順序でソート
		list.sort(new PathOrder());
		
		for (FileEntry e : list) {
			int l = e.sizeList.size();
			for (int i = 0; i < sizeListCount - l; i++) {
				e.sizeList.add(new Long(0));
			}
			e.size = e.sizeList.get(e.sizeList.size() - 1);
		}
		FileEntry f = list.get(0);
		for (int i = 1; i < list.size(); i++) {
			FileEntry next = list.get(i);
			if (next.path.startsWith(f.path)) f.isDirectory = true;
			else f.isDirectory = false;
			f = next;
		}
	}
	
	/**
	 * このインスタンスが保持している list への参照を返却します。
	 * 返却された list の FileEntry 内容を変更した場合、このインスタンスの list が
	 * 変更されることに注意が必要です。
	 */
	public List<FileEntry> getList() {
		return list;
	}
	
	/**
	 * ファイルの深さ(階層、level)を指定して、該当する FileEntry からなる
	 * list を返却します。
	 * 返却された list の FileEntry 内容を変更した場合、このインスタンスの list が
	 * 変更されることに注意が必要です。
	 */
	public List<FileEntry> selectLevel(int level) {
		if (list == null) throw new IllegalStateException("set または readFile によって値を格納してください");
		ArrayList<FileEntry> result = new ArrayList<FileEntry>();
		
		for (FileEntry f : list) {
			if (f.level == level) result.add(f);
		}
		return result;
	}
	
	/**
	 * ファイルの種類(ファイル/ディレクトリ)を指定して、該当する FileEntry からなる
	 * list を返却します。
	 * 返却された list の FileEntry 内容を変更した場合、このインスタンスの list が
	 * 変更されることに注意が必要です。
	 */
	public List<FileEntry> selectFile(boolean isFile) {
		if (list == null) throw new IllegalStateException("set または readFile によって値を格納してください");
		ArrayList<FileEntry> result = new ArrayList<FileEntry>();
		
		for (FileEntry f : list) {
			if (f.isDirectory != isFile) result.add(f);
		}
		return result;
	}
	
/*-------------
 * inner class
 */
	/**
	 * サイズ, 深さ, パス名 の順に並べる Comparator
	 */
	static class SizeOrder implements Comparator<FileEntry> {
		public int compare(FileEntry a, FileEntry b) {
			if (a.size > b.size) return 1;
			if (a.size < b.size) return -1;
			if (a.level != b.level) return a.level - b.level;
			return a.path.compareTo(b.path);
		}
		
		public boolean equals(FileEntry a, FileEntry b) {
			return ((a.size == b.size)&& // 早くて分解能が高い size でまず比較
						(a.level == b.level)&&
						(a.path.equals(b.path)) ); // 遅いのは最後
		}
	}
	
	/**
	 * 増分, 深さ, パス名 の順に並べる Comparator
	 */
	static class IncreaseOrder implements Comparator<FileEntry> {
		public int compare(FileEntry a, FileEntry b) {
			if (a.increase > b.increase) return 1;
			if (a.increase < b.increase) return -1;
			if (a.level != b.level) return a.level - b.level;
			return a.path.compareTo(b.path);
		}
		
		public boolean equals(FileEntry a, FileEntry b) {
			return ((a.increase == b.increase)&& // 早くて分解能が高い increase でまず比較
						(a.level == b.level)&&
						(a.path.equals(b.path)) ); // 遅いのは最後
		}
	}
	
	/**
	 * パス名 の辞書式順序で並べる Comparator
	 */
	static class PathOrder implements Comparator<FileEntry> {
		public int compare(FileEntry a, FileEntry b) {
			return a.path.compareTo(b.path);
		}
		
		public boolean equals(FileEntry a, FileEntry b) {
			return a.path.equals(b.path);
		}
	}
	
/*---------------
 * class methods
 */
	public static void writeJsonFile(FileList fileList,
							List<FileEntry> target,
							String filename) throws IOException {
		FileOutputStream fos = new FileOutputStream(filename);
		Writer fw = new OutputStreamWriter(fos, "UTF-8");
		PrintWriter p = new PrintWriter(fw);
		
		p.println("["); // start mark
		boolean first = true;
		for (FileEntry fe : target) {
			if (!fe.isDirectory) continue;
			if (!first) {
				p.println(",");
			} else {
				first = false;
			}
			p.println("  {");
			String path = fe.path;
			path = path.replace("\\", "\\\\");
			p.println("    \"key\": \"" + path + "\",");
			p.print("    \"values\": [ ");
			int i = 0;
			for (Long date : fileList.dateList) {
				if (i > 0) p.print(" , ");
				p.print("{\"x\":" + date + " , \"y\":" + (fe.sizeList.get(i++)/1024/1024) + "}");
			}
			p.println("]");
			p.print("  }");
		}
		p.println();
		p.println("]");
		
		p.close();
		fw.close();
		fos.close();
	}
	
	public static void writePieChartJsonFile(FileList fileList,
							List<FileEntry> target,
							String filename) throws IOException {
		FileOutputStream fos = new FileOutputStream(filename);
		Writer fw = new OutputStreamWriter(fos, "UTF-8");
		PrintWriter p = new PrintWriter(fw);
		
		p.println("["); // start mark
		boolean first = true;
		for (FileEntry fe : target) {
			if (!fe.isDirectory) continue;
			if (!first) {
				p.println(",");
			} else {
				first = false;
			}
			p.println("  {");
			String path = fe.path;
			path = path.replace("\\", "\\\\");
			p.println("    \"label\": \"" + path + "\",");
			p.println("    \"value\": \"" +(fe.size/1024/1024)+"\"" );
			p.println("  }");
		}
		p.println("]");
		
		p.close();
		fw.close();
		fos.close();
	}

	
	public static void writeFile(String filename, List<FileEntry> target, List<Long> dateList, int maxCount)
				throws IOException {
		FileOutputStream fos = new FileOutputStream(filename);
		Writer fw = new OutputStreamWriter(fos, "Shift_JIS"); // for EXCEL
		PrintWriter p = new PrintWriter(fw);
		int count = 0;
		
		p.print("フォルダ");
		for (Long date : dateList) {
			p.print(",");
			p.print(sdf.format(new Date(date)));
		}
		p.println();
		for (FileEntry fe : target) {
			p.print(fe.path);
			for (Long size : fe.sizeList) {
				p.print(",");
				p.print(size/1024/1024); // Mbyte
			}
			p.println();
			count++;
			if (count >= maxCount) break;
		}
		
		p.close();
		fw.close();
		fos.close();
	}
	
	public static List<FileEntry> cut(List<FileEntry> src, int count) {
		List<FileEntry> result = new ArrayList<FileEntry>();
		for (int i = 0; i < count; i++) {
			result.add(src.get(i));
		}
		return result;
	}
	
/*------
 * main
 */
	public static void main(String[] args) throws Exception {
		FileList a = new FileList();
		a.readFile("Merged20160516.csv");
		a.addDateList("list20160212.csv");
		a.addDateList("list20160308.csv");
		a.addDateList("list20160418.csv");
		a.addDateList("list20160510.csv");
		a.addDateList("list20160516.csv");
		
		a.addFile("list20160527.csv");
		
		String date = sdf.format(new Date());
		
		// レベル1で増分の大きい順に表示
		System.out.println("■大きなディレクトリ(ファイル) 階層=1");
		List<FileEntry> l1 = a.selectLevel(1);
		l1.sort(new IncreaseOrder().reversed());
		for (FileEntry f : l1) {
			System.out.println(f.path + "," + f.increase + "," + f.size);
		}
		System.out.println();
		
		writeJsonFile(a, l1, "simpleLineData"+date+"l1.json");
		writePieChartJsonFile(a, l1, "pieChart"+date+"l1size.json");
		
		// レベル2で増分の大きい順に10個表示
		System.out.println("■増分の大きなディレクトリ(ファイル) 階層=2");
		
		List<FileEntry> l2 = a.selectLevel(2);
		
		l2.sort(new IncreaseOrder().reversed());
		int c = 0;
		for (FileEntry f : l2) {
			System.out.println(f.path + "," + f.increase + "," + f.size);
			c++;
			if (c >= 10) break;
		}
		System.out.println();
		
		writeJsonFile(a, cut(l2, 10), "simpleLineData"+date+"l2.json");
		
		// レベル3で増分の大きい順に20個表示
		System.out.println("■増分の大きなディレクトリ(ファイル) 階層=3");
		
		List<FileEntry> l3 = a.selectLevel(3);
		l3.sort(new IncreaseOrder().reversed());
		c = 0;
		for (FileEntry f : l3) {
			System.out.println(f.path + "," + f.increase + "," + f.size);
			c++;
			if (c >= 20) break;
		}
		System.out.println();
		
		// グラフ化のcsvを作成
		// レベル1のサイズのデータ
		writeFile("ApplyToGraph"+date+"_Level1_size.csv", l1, a.dateList, 999999);
		writeFile("ApplyToGraph"+date+"_Level2_size.csv", l2, a.dateList, 10);
		
		// 同一ファイル疑惑を探す
		System.out.println("■以下のファイルは同一ファイルと思われます。ショートカット化できないか検討してください。");
		List<FileEntry> list = a.selectFile(true);
		list.sort(new SizeOrder().reversed());
		
		long lastSize = -1;
		String lastPath = "";
		String lastFile = "";
		c = 0;
		for (FileEntry f : list) {
			String p = f.path;
			try {
				String[] t = p.split("\\\\");
				if (lastFile.equals(t[t.length-1])) {
					System.out.println("-------------------------------------------");
					System.out.println(lastPath);
					System.out.println(f.path);
				}
				lastSize = f.size;
				lastPath = f.path;
				lastFile = t[t.length-1];
				c++;
				if (c > 20) break;
			} catch (Exception e) {
				System.out.println(e);
				System.out.println(p);
				break;
			}
		}
		// 大きいファイルを20個表示
		System.out.println("■サイズの大きなファイル20");
		c = 0;
		for (FileEntry f : list) {
			System.out.println(f.path + "," + f.size);
			c++;
			if (c >= 20) break;
		}

	}
	
}
