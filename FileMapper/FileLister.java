import java.io.*;
import java.util.StringTokenizer;
import java.util.NoSuchElementException;
import java.util.Date;
import java.text.SimpleDateFormat;

/**
 * 指定されたディレクトリ以下のファイルパス、ファイルサイズ(ディレクトリの場合は配下の
 * ファイルサイズの総和)を csv 形式でファイルに出力する。
 * ファイル名は listyyyyMMdd.csv とする。
 *
 * @version 2016/3/14 修正(,や'がファイル名にある場合、カット)
 */
public class FileLister {
	
	SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd");
	PrintWriter out;
	
	public final static int MAX_DEPTH = 20;
	

	public void list(File f) throws IOException {
		FileWriter fw = new FileWriter("list"+sdf.format(new Date()) + ".csv");
		out = new PrintWriter(fw);
		list(f, 0);
		out.close();
	}
	
	private long list(File f, int depth) throws IOException {
		if (f.isDirectory()) {
			// ディレクトリの場合
			File[] file = f.listFiles();
			if (file == null) return 0L;
			
			long size = 0;
			for (int i = 0; i < file.length; i++) {
				if (file[i] != null) {
					size += list(file[i], depth + 1);
				}
			}
			printFile(f, size, depth);
			return size;
			
		} else {
			// 通常のファイルの場合
			long size = f.length();
			printFile(f, size, depth);
			return size;
		}
	}
	
	/**
	 * 
	 */
	protected void printFile(File f, long size, int depth) throws IOException {
		out.print(""+depth+",");
		printPath(f.getPath());
		out.println(size);
	}
	
	protected void printPath(String path) {
		StringTokenizer st = new StringTokenizer(path, "\\");
		for (int i = 0; i < MAX_DEPTH; i++) {
			try {
				out.print(cutIllegalChar(st.nextToken()));
			} catch (NoSuchElementException nsee) {
			}
			out.print(",");
		}
	}
	
	/**
	 * ファイルの文字列から特定の文字列 ' , をreplaceする
	 */
	private String cutIllegalChar(String target) {
		return target.replace("\'","<Q>").replace(",","<c>");
	}
	
	
/*------
 * main
 */
	public static void main(String[] args) throws Exception {
		FileLister f = new FileLister();
		f.list(new File(args[0]));
	}
	
}


