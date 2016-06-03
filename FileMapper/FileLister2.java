import java.io.*;
import java.util.StringTokenizer;
import java.util.NoSuchElementException;
import java.util.Date;
import java.text.SimpleDateFormat;
import java.nio.*;
import java.nio.file.*;
import java.nio.file.attribute.UserPrincipal;

/**
 * 指定されたディレクトリ以下のファイルパス、ファイルサイズ(ディレクトリの場合は配下の
 * ファイルサイズの総和)を csv 形式でファイルに出力する。
 * ファイル名は listyyyyMMdd.csv とする。
 *
 * @version 2016/3/14 修正(,や'がファイル名にある場合、カット)
 *          2016/5/20 最後にオーナーを追加
 */
public class FileLister2 {
	
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
		out.print(String.valueOf(depth)+",");
		printPath(f.getPath());
		out.print(size);
		out.print(',');
		out.println(Files.getOwner(f.toPath()).getName());
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
		FileLister2 f = new FileLister2();
		f.list(new File(args[0]));
	}
	
}


